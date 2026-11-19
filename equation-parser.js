(() => {
  "use strict";

  const maxLength = 320;
  const maxTokens = 150;
  const maxDepth = 22;
  const maxCoordinate = 1e100;
  const curveStrands = 30;
  const stepsPerStrand = 32;
  const gridLines = 18;
  const stepsPerGridLine = 72;
  const constants = new Map([["pi", Math.PI], ["tau", Math.PI * 2], ["e", Math.E]]);
  const unaryFunctions = [
    "abs", "acos", "asin", "atan", "cbrt", "ceil", "cos", "cosh", "exp",
    "floor", "log", "log10", "round", "sign", "sin", "sinh", "sqrt", "tan", "tanh",
  ];
  const functions = new Map(unaryFunctions.map(name => [name, { evaluate: Math[name], min: 1, max: 1 }]));
  functions.set("ln", functions.get("log"));
  functions.set("atan2", { evaluate: Math.atan2, min: 2, max: 2 });
  functions.set("hypot", { evaluate: Math.hypot, min: 2, max: 4 });
  functions.set("min", { evaluate: Math.min, min: 2, max: 4 });
  functions.set("max", { evaluate: Math.max, min: 2, max: 4 });
  functions.set("pow", { evaluate: Math.pow, min: 2, max: 2 });

  function tokenize(expression) {
    const tokens = [];
    let cursor = 0;
    while (cursor < expression.length) {
      if (/\s/.test(expression[cursor])) {
        cursor++;
        continue;
      }
      if (tokens.length >= maxTokens) throw new Error("This equation has too many terms. Try a shorter expression.");

      const rest = expression.slice(cursor);
      const number = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/.exec(rest);
      const identifier = /^[a-z][a-z_0-9]*/.exec(rest);
      const operator = rest.startsWith("**") ? "**" : rest[0];

      if (number) {
        const value = Number(number[0]);
        if (!Number.isFinite(value)) throw new Error("One of the numbers in the equation is too large.");
        tokens.push({ type: "number", value, column: cursor + 1 });
        cursor += number[0].length;
      } else if (identifier) {
        tokens.push({ type: "name", value: identifier[0], column: cursor + 1 });
        cursor += identifier[0].length;
      } else if ("+-*/%^(),".includes(rest[0])) {
        tokens.push({ type: operator === "**" ? "^" : operator, column: cursor + 1 });
        cursor += operator.length;
      } else {
        throw new Error(`Unexpected character “${rest[0]}” at position ${cursor + 1}.`);
      }
    }
    tokens.push({ type: "end", column: expression.length + 1 });
    return tokens;
  }

  class Parser {
    constructor(expression, variables) {
      this.tokens = tokenize(expression);
      this.variables = variables;
      this.position = 0;
      this.depth = 0;
    }

    get current() {
      return this.tokens[this.position];
    }

    take(type) {
      if (this.current.type !== type) return false;
      this.position++;
      return true;
    }

    expect(type, message) {
      if (!this.take(type)) throw new Error(`${message} Position ${this.current.column}.`);
    }

    nested(read) {
      if (this.depth >= maxDepth) throw new Error("This equation is nested too deeply. Try simplifying it.");
      this.depth++;
      try {
        return read();
      } finally {
        this.depth--;
      }
    }

    read() {
      const evaluate = this.sum();
      this.expect("end", "Expected an operator or the end of the equation.");
      return evaluate;
    }

    sum() {
      let evaluate = this.product();
      while (this.current.type === "+" || this.current.type === "-") {
        const addition = this.current.type === "+";
        this.position++;
        const left = evaluate;
        const right = this.product();
        evaluate = addition ? scope => left(scope) + right(scope) : scope => left(scope) - right(scope);
      }
      return evaluate;
    }

    product() {
      let evaluate = this.unary();
      while (true) {
        const { type } = this.current;
        const explicit = type === "*" || type === "/" || type === "%";
        const implicit = type === "name" || type === "(";
        if (!explicit && !implicit) return evaluate;
        if (explicit) this.position++;

        const left = evaluate;
        const right = this.unary();
        if (type === "/") {
          evaluate = scope => left(scope) / right(scope);
        } else if (type === "%") {
          evaluate = scope => left(scope) % right(scope);
        } else {
          evaluate = scope => left(scope) * right(scope);
        }
      }
    }

    unary() {
      if (this.take("+")) return this.nested(() => this.unary());
      if (this.take("-")) {
        const evaluate = this.nested(() => this.unary());
        return scope => -evaluate(scope);
      }
      return this.power();
    }

    power() {
      const base = this.primary();
      if (!this.take("^")) return base;
      const exponent = this.nested(() => this.unary());
      return scope => Math.pow(base(scope), exponent(scope));
    }

    primary() {
      const token = this.current;
      if (this.take("number")) return () => token.value;
      if (this.take("(")) {
        const evaluate = this.nested(() => this.sum());
        this.expect(")", "Expected a closing parenthesis.");
        return evaluate;
      }
      if (this.take("name")) {
        if (this.variables.has(token.value)) {
          const index = this.variables.get(token.value);
          return scope => scope[index];
        }
        if (constants.has(token.value)) {
          const value = constants.get(token.value);
          return () => value;
        }
        const description = functions.get(token.value);
        if (description) return this.call(token.value, description);

        if (["x", "y", "z", "t"].includes(token.value)) {
          throw new Error(`“${token.value}” is unavailable here. Use ${[...this.variables.keys()].join(" and ")} in this equation.`);
        }
        throw new Error(`Unknown name “${token.value}”.`);
      }
      throw new Error(`Expected a number, variable, or function at position ${token.column}.`);
    }

    call(name, { evaluate, min, max }) {
      this.expect("(", `Write ${name} with parentheses around its arguments.`);
      const args = [];
      if (!this.take(")")) {
        do {
          if (args.length >= max) throw new Error(`${name} accepts at most ${max} argument${max === 1 ? "" : "s"}.`);
          args.push(this.nested(() => this.sum()));
        } while (this.take(","));
        this.expect(")", `Expected a closing parenthesis for ${name}.`);
      }
      if (args.length < min) throw new Error(`${name} needs ${min} argument${min === 1 ? "" : "s"}.`);
      if (args.length === 1) return scope => evaluate(args[0](scope));
      if (args.length === 2) return scope => evaluate(args[0](scope), args[1](scope));
      if (args.length === 3) return scope => evaluate(args[0](scope), args[1](scope), args[2](scope));
      return scope => evaluate(args[0](scope), args[1](scope), args[2](scope), args[3](scope));
    }
  }

  const scalarVariables = new Map([["x", 0]]);
  const surfaceVariables = new Map([["x", 0], ["y", 1]]);
  const parametricVariables = new Map([["t", 0]]);

  function samples(steps, lower, upper) {
    return Array.from({ length: steps + 1 }, (_, index) => lower + ((upper - lower) * index) / steps);
  }

  function finite(value) {
    return Number.isFinite(value) && Math.abs(value) <= maxCoordinate;
  }

  function heightScale(values) {
    const magnitudes = values.filter(finite).map(Math.abs).sort((a, b) => a - b);
    if (!magnitudes.length) return 1;
    const maximum = magnitudes[magnitudes.length - 1];
    const typical = magnitudes[Math.floor((magnitudes.length - 1) * 0.94)];
    return (typical > 0 ? Math.min(maximum, typical * 1.5) : maximum) || 1;
  }

  function height(value, scale, amplitude) {
    const relative = value / scale;
    return finite(value) && Math.abs(relative) <= 1.13 ? relative * amplitude : null;
  }

  function withBreaks(points) {
    const path = [];
    let previous = null;
    for (const point of points) {
      if (point && previous &&
        Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]) > 0.77) {
        path.push(null);
      }
      path.push(point);
      previous = point;
    }
    return path;
  }

  function curvePaths(points) {
    return Array.from({ length: curveStrands }, (_, index) => {
      const offset = index * stepsPerStrand;
      return withBreaks(points.slice(offset, offset + stepsPerStrand + 1));
    });
  }

  function scalarPaths(evaluate) {
    const domain = samples(curveStrands * stepsPerStrand, -6, 6);
    const values = domain.map(x => evaluate([x]));
    const scale = heightScale(values);
    const points = values.map((value, index) => {
      const normalized = height(value, scale, 0.93);
      return normalized === null ? null : [domain[index] / 6, normalized, 0];
    });
    return curvePaths(points);
  }

  function surfacePaths(evaluate) {
    const fixed = samples(gridLines - 1, -5, 5);
    const varying = samples(stepsPerGridLine, -5, 5);
    const buildLine = (value, horizontal) => varying.map(other => {
      const x = horizontal ? other : value;
      const y = horizontal ? value : other;
      return [x, evaluate([x, y]), y];
    });

    const raw = [
      ...fixed.map(value => buildLine(value, true)),
      ...fixed.map(value => buildLine(value, false)),
    ];
    const scale = heightScale(raw.flatMap(line => line.map(point => point[1])));
    return raw.map(line => withBreaks(line.map(([x, value, y]) => {
      const normalized = height(value, scale, 0.76);
      return normalized === null ? null : [x / 5, normalized, -y / 5];
    })));
  }

  function parametricPaths(evaluators) {
    const domain = samples(curveStrands * stepsPerStrand, 0, Math.PI * 2);
    const raw = domain.map(t => {
      const point = evaluators.map(evaluate => evaluate([t]));
      return point.every(finite) ? point : null;
    });
    const points = raw.filter(point => point !== null);
    if (points.length === 0) return curvePaths(raw);

    const centers = [];
    let extent = 0;
    for (let axis = 0; axis < 3; axis++) {
      const values = points.map(point => point[axis]).sort((a, b) => a - b);
      const innerLow = values[Math.floor((values.length - 1) * 0.025)];
      const innerHigh = values[Math.ceil((values.length - 1) * 0.975)];
      const center = (innerLow + innerHigh) / 2;
      const innerExtent = (innerHigh - innerLow) / 2;
      const fullExtent = Math.max(center - values[0], values[values.length - 1] - center);
      centers.push(center);
      extent = Math.max(extent, innerExtent > 0 ? Math.min(fullExtent, innerExtent * 1.36) : fullExtent);
    }
    if (extent === 0) throw new Error("These components describe a single point. Make at least one of them change with t.");

    return curvePaths(raw.map(point => {
      if (!point) return null;
      const normalized = point.map((value, axis) => (value - centers[axis]) / extent);
      return normalized.every(value => Math.abs(value) <= 1.1) ? normalized : null;
    }));
  }

  function plot(source) {
    if (typeof source !== "string") throw new Error("Enter an equation to plot.");
    if (source.length > maxLength) throw new Error(`Keep the equation to ${maxLength} characters or fewer.`);
    const equation = source.trim().toLowerCase()
      .replaceAll("π", " pi ")
      .replaceAll("×", "*")
      .replaceAll("÷", "/")
      .replaceAll("−", "-");
    if (!equation) throw new Error("Enter an equation to plot.");

    const components = equation.split(";");
    let kind = "curve";
    let paths;
    if (components.length > 1) {
      if (components.length !== 3 || components.some(component => !component.trim())) {
        throw new Error("Separate three parametric expressions with semicolons, one for each coordinate.");
      }
      const coordinateLabels = [/^\s*x(?:\s*\(\s*t\s*\))?\s*=\s*/, /^\s*y(?:\s*\(\s*t\s*\))?\s*=\s*/, /^\s*z(?:\s*\(\s*t\s*\))?\s*=\s*/];
      const evaluators = components.map((component, index) =>
        new Parser(component.replace(coordinateLabels[index], ""), parametricVariables).read());
      paths = parametricPaths(evaluators);
    } else if (/^z\s*=/.test(equation)) {
      kind = "surface";
      paths = surfacePaths(new Parser(equation.replace(/^z\s*=\s*/, ""), surfaceVariables).read());
    } else {
      paths = scalarPaths(new Parser(equation.replace(/^y\s*=\s*/, ""), scalarVariables).read());
    }

    if (!paths.some(path => path.some((point, index) => point && path[index + 1]))) {
      throw new Error("There is no continuous real-valued curve in the sampled range. Try a different equation.");
    }
    return { paths, kind };
  }

  window.PortfolioEquations = Object.freeze({ plot });
})();
