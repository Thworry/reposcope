import { describe, expect, it } from "vitest";

import {
  compactPythonChoiceSource,
  malformedPythonSource,
  pythonBindingCoverageSource,
  pythonSourceFile,
  pythonSyntaxCoverageSource,
} from "../../test/fixtures/python-source";
import { analyzePython } from "./python";

describe("Python analyzer", () => {
  it("computes the exact compact function, public API, and docstring metrics", () => {
    const result = analyzePython([
      pythonSourceFile("src/choose.py", compactPythonChoiceSource),
    ]);

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]).toMatchObject({
      path: "src/choose.py",
      name: "choose",
      startLine: 1,
      endLine: 5,
      logicalLines: 5,
      cyclomatic: 3,
      maxNesting: 1,
      hasErrorHandling: false,
      isTest: false,
    });
    expect(result.files[0]).toMatchObject({
      path: "src/choose.py",
      language: "python",
      logicalLines: 5,
      isTest: false,
    });
    expect(result.exportedDeclarations).toBe(1);
    expect(result.documentedExports).toBe(1);
    expect(result.parseFailures).toEqual([]);
  });

  it("covers async functions, classes, methods, all decisions, nesting, errors, docs, and imports", () => {
    const result = analyzePython([
      pythonSourceFile("src/service.py", pythonSyntaxCoverageSource),
    ]);
    const functions = new Map(
      result.functions.map((metric) => [metric.name, metric]),
    );

    expect([...functions.keys()]).toEqual(
      expect.arrayContaining(["consume", "run", "inner", "_private"]),
    );
    expect(functions.get("consume")).toMatchObject({
      cyclomatic: 3,
      maxNesting: 2,
      hasErrorHandling: false,
    });
    expect(functions.get("run")).toMatchObject({
      cyclomatic: 14,
      maxNesting: 2,
      hasErrorHandling: true,
    });
    expect(functions.get("inner")).toMatchObject({
      cyclomatic: 2,
      maxNesting: 1,
      hasErrorHandling: false,
    });
    expect(result.files[0]?.relativeImports).toEqual([
      "..",
      "...core.tools",
      ".helper",
    ]);
    expect(result.files[0]?.relativeImportCandidates).toEqual(["..sibling"]);
    expect(result.exportedDeclarations).toBe(3);
    expect(result.documentedExports).toBe(2);
  });

  it("counts only Python bindings and applies the exact lowercase short-name allowlist", () => {
    const result = analyzePython([
      pythonSourceFile("src/bindings.py", pythonBindingCoverageSource),
    ]);

    expect(result.identifierOccurrences).toBe(13);
    expect(result.ambiguousIdentifierOccurrences).toBe(11);
  });

  it("counts annotations, named expressions, comprehensions, and real match captures as bindings", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/modern-bindings.py",
        `annotated: Model
values = [uv for uv in rows]
if (xy := value):
    pass
match value:
    case pq:
        pass
    case _:
        pass`,
      ),
    ]);

    expect(result.identifierOccurrences).toBe(1);
    expect(result.ambiguousIdentifierOccurrences).toBe(1);
  });

  it("excludes module-bound comprehension walrus targets", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/module-comprehension-walrus.py",
        "values = [(ab := item) for cd in rows]",
      ),
    ]);

    expect(result.identifierOccurrences).toBe(1);
    expect(result.ambiguousIdentifierOccurrences).toBe(1);
  });

  it("applies global declarations to comprehension walrus targets", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/global-comprehension-walrus.py",
        `def choose(rows):
    global ab
    values = [(ab := item) for cd in rows]
    return values`,
      ),
    ]);

    expect(result.identifierOccurrences).toBe(4);
    expect(result.ambiguousIdentifierOccurrences).toBe(1);
  });

  it("applies nonlocal declarations to nested comprehension walrus targets", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/nonlocal-comprehension-walrus.py",
        `def outer(rows):
    ab = None

    def inner():
        nonlocal ab
        values = [(ab := item) for cd in rows]
        return values

    return inner`,
      ),
    ]);

    expect(result.identifierOccurrences).toBe(6);
    expect(result.ambiguousIdentifierOccurrences).toBe(2);
  });

  it("counts a function-local comprehension walrus target exactly once", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/local-comprehension-walrus.py",
        `def choose(rows):
    values = [(ab := item) for cd in rows]
    return ab, values`,
      ),
    ]);

    expect(result.identifierOccurrences).toBe(5);
    expect(result.ambiguousIdentifierOccurrences).toBe(2);
  });

  it("keeps comprehension walrus targets local to their containing lambda", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/lambda-comprehension-walrus.py",
        `def choose(rows):
    global ab
    callback = lambda: [(ab := item) for cd in rows]
    return callback`,
      ),
    ]);

    expect(result.identifierOccurrences).toBe(5);
    expect(result.ambiguousIdentifierOccurrences).toBe(2);
  });

  it("keeps nested comprehension iteration targets comprehension-local", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/nested-comprehension-targets.py",
        "values = [[ef for ef in row] for cd in rows]",
      ),
    ]);

    expect(result.identifierOccurrences).toBe(2);
    expect(result.ambiguousIdentifierOccurrences).toBe(2);
  });

  it("counts only local lexical bindings outside class, module, and type-alias scopes", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/scopes.py",
        `module_value = 1
type Alias = tuple[int, int]

class Container:
    class_value = 1

    def method(self, rows):
        local_value = 1
        chosen = [uv for uv in rows]
        if (xy := local_value):
            with open("file") as gh:
                try:
                    match xy:
                        case pq:
                            return chosen
                except Exception as zz:
                    return gh
        return chosen`,
      ),
    ]);

    expect(result.identifierOccurrences).toBe(11);
    expect(result.ambiguousIdentifierOccurrences).toBe(5);
  });

  it("excludes global and nonlocal assignment targets in only their declaring function scope", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/scope-statements.py",
        `shared = 0

def outer():
    value = 1
    other = 2

    def inner():
        if condition:
            nonlocal value
            global shared
        value = 3
        shared = 4
        local = 5

        def nested():
            value = 6
            shared = 7
            own_value = 8
            return own_value

        return local

    def sibling():
        value = 9
        shared = 10
        return value

    return inner`,
      ),
    ]);

    expect(result.identifierOccurrences).toBe(12);
    expect(result.ambiguousIdentifierOccurrences).toBe(0);
  });

  it("stops scope declarations at nested class and lambda lexical boundaries", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/scope-boundaries.py",
        `def boundaries():
    global target

    class Container:
        global class_global
        class_global = 1

    callback = lambda: (target := 2)
    target = 3
    class_global = 4
    return callback`,
      ),
    ]);

    expect(result.identifierOccurrences).toBe(5);
  });

  it("counts parameter targets without counting annotation or default-value references", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/parameters.py",
        `def parameters(a=default, b: Model=(one, two), /, *args, c: Kind=make(ref), **kwargs):
    callback = lambda d=default, ef=make(ref), *items, **gh: d
    return callback`,
      ),
    ]);

    expect(result.identifierOccurrences).toBe(11);
    expect(result.ambiguousIdentifierOccurrences).toBe(6);
  });

  it("normalizes literals, discards comments, and preserves identifiers and operators", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/tokens.py",
        `text = "secret"
count = 42
view = f"item {count}"
enabled = count and True  # hidden`,
      ),
    ]);
    const tokens = result.files[0]?.normalizedTokens ?? [];

    expect(tokens).toEqual(
      expect.arrayContaining([
        "text",
        "STRING",
        "count",
        "NUMBER",
        "TEMPLATE",
        "and",
      ]),
    );
    expect(tokens).not.toEqual(
      expect.arrayContaining(['"secret"', "42", 'f"item {count}"', "hidden"]),
    );
  });

  it("normalizes an f-string shell while retaining replacement-expression tokens", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/template.py",
        `f"prefix {count + 2} {format('x')} suffix"`,
      ),
    ]);

    expect(result.files[0]?.normalizedTokens).toEqual([
      "TEMPLATE",
      "count",
      "+",
      "NUMBER",
      "format",
      "(",
      "STRING",
      ")",
    ]);
  });

  it("assigns nested f-string replacements to their nearest template exactly once", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/nested-template.py",
        `f"outer {f'inner {value!r:{width}}'} sibling {other=}"`,
      ),
    ]);

    expect(result.files[0]?.normalizedTokens).toEqual([
      "TEMPLATE",
      "TEMPLATE",
      "value",
      "width",
      "other",
    ]);
  });

  it("isolates lambda decisions from the enclosing function metric", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/lambda.py",
        `def outer():
    callback = lambda value: (local_value := 1 if value and other or third else 0)
    return callback`,
      ),
    ]);

    expect(result.functions).toEqual([
      expect.objectContaining({
        name: "outer",
        cyclomatic: 1,
        maxNesting: 0,
        hasErrorHandling: false,
      }),
    ]);
    expect(result.identifierOccurrences).toBe(4);
  });

  it("does not add lambda nesting beyond an enclosing decision", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/decision-lambda.py",
        `def outer(flag):
    if flag:
        callback = lambda value: 1 if value and other or third else 0
        return callback
    return None`,
      ),
    ]);

    expect(result.functions[0]).toMatchObject({
      name: "outer",
      cyclomatic: 2,
      maxNesting: 1,
      hasErrorHandling: false,
    });
  });

  it("isolates a recovered malformed tree and counts only successful bytes", () => {
    const valid = pythonSourceFile(
      "src/valid.py",
      "def valid():\n    return 1",
    );
    const malformed = pythonSourceFile("src/broken.py", malformedPythonSource);
    const result = analyzePython([malformed, valid]);

    expect(result.files.map((file) => file.path)).toEqual(["src/valid.py"]);
    expect(result.functions.map((metric) => metric.name)).toEqual(["valid"]);
    expect(result.parsedBytes).toBe(valid.bytes);
    expect(result.parseFailures).toEqual([
      { path: "src/broken.py", language: "python", reason: "syntax" },
    ]);
  });

  it("excludes interface-only stubs from source denominators and metrics", () => {
    const stub = pythonSourceFile(
      "src/service.pyi",
      "def choose(value: int) -> int: ...",
    );
    const result = analyzePython([stub]);

    expect(result.files).toEqual([
      {
        path: "src/service.pyi",
        language: "python",
        logicalLines: 0,
        isTest: false,
        normalizedTokens: [],
        relativeImports: [],
        relativeImportCandidates: [],
        topLevelDefinedNames: ["choose"],
      },
    ]);
    expect(result.functions).toEqual([]);
    expect(result.identifierOccurrences).toBe(0);
    expect(result.exportedDeclarations).toBe(0);
    expect(result.parsedBytes).toBe(0);
  });

  it("retains only relative stub imports for resolution without parsed coverage bytes", () => {
    const stub = pythonSourceFile(
      "src/service.pyi",
      `from .model import Model
from ..shared import Shared
from package import External
def choose(value: Model) -> Shared: ...`,
    );
    const result = analyzePython([stub]);

    expect(result.files[0]).toEqual({
      path: "src/service.pyi",
      language: "python",
      logicalLines: 0,
      isTest: false,
      normalizedTokens: [],
      relativeImports: ["..shared", ".model"],
      relativeImportCandidates: [],
      topLevelDefinedNames: ["External", "Model", "Shared", "choose"],
    });
    expect(result.parsedBytes).toBe(0);
    expect(result.identifierOccurrences).toBe(0);
  });

  it("counts only top-level public APIs and direct public methods with first-statement docstrings", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/docs.py",
        `"""Module docs do not document declarations."""

@decorate
def decorated():
    """Documented."""
    return 1

def detached():
    value = 1
    """Not a first-statement docstring."""
    return value

class Public:
    """Documented class."""

    @decorate
    def method(self):
        """Documented method."""
        return 1

    def _private_method(self):
        """Private."""
        return 2

def outer():
    def nested():
        """Nested is not public API."""
        return 1
    return nested()`,
      ),
    ]);

    expect(result.exportedDeclarations).toBe(5);
    expect(result.documentedExports).toBe(3);
  });

  it("accepts ordinary Python docstring forms but rejects bytes and f-strings", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/docstring-forms.py",
        `def parenthesized():
    # A comment does not displace the first statement.
    ("Parenthesized.")

def concatenated():
    "First " "second."

class RawDocs:
    r"Raw class docs."

    def unicode_method(self):
        u"Unicode method docs."

    def bytes_method(self):
        b"Not a docstring."

def formatted():
    f"Not a docstring {value}."

def _private():
    "Private docs."
`,
      ),
    ]);

    expect(result.exportedDeclarations).toBe(6);
    expect(
      analyzePython([
        pythonSourceFile(
          "src/parenthesized.py",
          `def parenthesized():\n    ("Parenthesized.")`,
        ),
      ]).documentedExports,
    ).toBe(1);
    expect(
      analyzePython([
        pythonSourceFile(
          "src/concatenated.py",
          `def concatenated():\n    "First " "second."`,
        ),
      ]).documentedExports,
    ).toBe(1);
    expect(
      analyzePython([
        pythonSourceFile(
          "src/raw.py",
          `class RawDocs:\n    r"Raw class docs."`,
        ),
      ]).documentedExports,
    ).toBe(1);
    expect(
      analyzePython([
        pythonSourceFile(
          "src/unicode.py",
          `class Public:\n    def unicode_method(self):\n        u"Unicode method docs."`,
        ),
      ]).documentedExports,
    ).toBe(1);
    expect(
      analyzePython([
        pythonSourceFile(
          "src/bytes.py",
          `def bytes_doc():\n    b"Not a docstring."`,
        ),
      ]).documentedExports,
    ).toBe(0);
    expect(result.documentedExports).toBe(4);
  });

  it("omits canonical TYPE_CHECKING true-branch imports from runtime edges", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/type-only.py",
        `from .runtime import runtime
if TYPE_CHECKING:
    from .types import TypeOnly
    if flag:
        from .nested_types import NestedType
else:
    from .fallback import fallback

if (typing.TYPE_CHECKING):
    from .more_types import MoreType

if flag:
    from .live import live`,
      ),
    ]);

    expect(result.files[0]?.relativeImports).toEqual([
      ".fallback",
      ".live",
      ".runtime",
    ]);
    expect(result.identifierOccurrences).toBe(6);
  });

  it("retains package bases and imported submodule candidates from relative import lists", () => {
    const result = analyzePython([
      pythonSourceFile(
        "pkg/imports.py",
        `from . import b, c as see, Thing
from .. import parent_module as parent_alias
if TYPE_CHECKING:
    from . import type_only`,
      ),
    ]);

    expect(result.files[0]?.relativeImports).toEqual([".", ".."]);
    expect(result.files[0]?.relativeImportCandidates).toEqual([
      "..parent_module",
      ".Thing",
      ".b",
      ".c",
    ]);
  });

  it.each([
    [
      "nested true branch",
      `b = set
try:
    if True:
        del b
        risky()
except Exception:
    from . import b`,
      [".b"],
    ],
    [
      "with body",
      `b = set
try:
    with context():
        del b
        risky()
except Exception:
    from . import b`,
      [".b"],
    ],
    [
      "nested try with else",
      `b = set
try:
    try:
        del b
        risky()
    except ValueError:
        pass
    else:
        b = set
except Exception:
    from . import b`,
      [".b"],
    ],
    [
      "nested try with non-restoring finally",
      `b = set
try:
    try:
        del b
        risky()
    finally:
        marker = object()
except Exception:
    from . import b`,
      [".b"],
    ],
    [
      "partially applied repeated delete",
      `b = set
try:
    del b, b
except Exception:
    from . import b`,
      [".b"],
    ],
    [
      "nested try with restoring finally",
      `b = set
try:
    try:
        del b
        risky()
    finally:
        b = None
except Exception:
    from . import b`,
      [],
    ],
  ] as const)(
    "propagates %s exceptional package-binding effects to handlers",
    (_, source, relativeImportCandidates) => {
      const result = analyzePython([
        pythonSourceFile("pkg/__init__.py", source),
      ]);

      expect(result.files[0]?.relativeImportCandidates).toEqual(
        relativeImportCandidates,
      );
    },
  );

  it.each([
    [
      "parenthesized delete target",
      `b = None
try:
    del (b)
    risky()
except Exception:
    from . import b`,
      [".b"],
    ],
    [
      "singleton tuple delete target",
      `b = None
try:
    del (b,)
    risky()
except Exception:
    from . import b`,
      [".b"],
    ],
    [
      "list delete target",
      `b = None
try:
    del [b]
    risky()
except Exception:
    from . import b`,
      [".b"],
    ],
    [
      "partially applied nested delete",
      `b = None
try:
    del (b, missing)
except Exception:
    from . import b`,
      [".b"],
    ],
  ] as const)(
    "propagates %s effects in source order",
    (_, source, relativeImportCandidates) => {
      const result = analyzePython([
        pythonSourceFile("pkg/__init__.py", source),
      ]);

      expect(result.files[0]).toMatchObject({
        relativeImportCandidates,
        topLevelDefinedNames: [],
      });
    },
  );

  it.each([
    ["member target", "del holder.b"],
    ["subscript target", "del holder[b]"],
  ] as const)(
    "treats an opaque %s without deleting nested names",
    (_, deletion) => {
      const result = analyzePython([
        pythonSourceFile(
          "pkg/__init__.py",
          `b = None
holder = object()
try:
    ${deletion}
except Exception:
    from . import b`,
        ),
      ]);

      expect(result.files[0]?.relativeImportCandidates).toEqual([]);
    },
  );

  it("preserves definite bindings on loop exceptional paths", () => {
    const result = analyzePython([
      pythonSourceFile(
        "pkg/__init__.py",
        `b = None
try:
    for item in [None]:
        raise Exception()
except Exception:
    from . import b`,
      ),
    ]);

    expect(result.files[0]).toMatchObject({
      relativeImportCandidates: [],
      topLevelDefinedNames: ["b"],
    });
  });

  it.each([
    [
      "for break",
      `for item in rows:
    break
else:
    b = None
from . import b`,
    ],
    [
      "while break",
      `while condition:
    break
else:
    b = None
from . import b`,
    ],
  ] as const)("does not apply loop else after a possible %s", (_, source) => {
    const result = analyzePython([pythonSourceFile("pkg/__init__.py", source)]);

    expect(result.files[0]).toMatchObject({
      relativeImportCandidates: [".b"],
      topLevelDefinedNames: [],
    });
  });

  it.each([
    [
      "for loop",
      `for item in rows:
    pass
else:
    b = None
from . import b`,
    ],
    [
      "while loop",
      `while condition:
    pass
else:
    b = None
from . import b`,
    ],
  ] as const)("applies %s else on every normal completion", (_, source) => {
    const result = analyzePython([pythonSourceFile("pkg/__init__.py", source)]);

    expect(result.files[0]).toMatchObject({
      relativeImportCandidates: [],
      topLevelDefinedNames: ["b"],
    });
  });

  it("keeps an inner-loop break scoped to the inner loop", () => {
    const result = analyzePython([
      pythonSourceFile(
        "pkg/__init__.py",
        `for item in rows:
    for nested in items:
        break
else:
    b = None
from . import b`,
      ),
    ]);

    expect(result.files[0]).toMatchObject({
      relativeImportCandidates: [],
      topLevelDefinedNames: ["b"],
    });
  });

  it("runs finally before a break leaves the loop", () => {
    const result = analyzePython([
      pythonSourceFile(
        "pkg/__init__.py",
        `for item in rows:
    try:
        break
    finally:
        b = None
else:
    b = None
from . import b`,
      ),
    ]);

    expect(result.files[0]).toMatchObject({
      relativeImportCandidates: [],
      topLevelDefinedNames: ["b"],
    });
  });

  it.each([
    ["unreachable break", "False", []],
    ["reachable break", "True", [".b"]],
  ] as const)(
    "respects an %s in a loop branch",
    (_, condition, relativeImportCandidates) => {
      const result = analyzePython([
        pythonSourceFile(
          "pkg/__init__.py",
          `for item in rows:
    if ${condition}:
        break
else:
    b = None
from . import b`,
        ),
      ]);

      expect(result.files[0]?.relativeImportCandidates).toEqual(
        relativeImportCandidates,
      );
    },
  );

  it("does not let continue skip loop else", () => {
    const result = analyzePython([
      pythonSourceFile(
        "pkg/__init__.py",
        `for item in rows:
    continue
else:
    b = None
from . import b`,
      ),
    ]);

    expect(result.files[0]).toMatchObject({
      relativeImportCandidates: [],
      topLevelDefinedNames: ["b"],
    });
  });

  it.each([
    ["raise", "raise RuntimeError()"],
    ["return", "return None"],
  ] as const)("ignores a break made unreachable by %s", (_, abrupt) => {
    const result = analyzePython([
      pythonSourceFile(
        "pkg/__init__.py",
        `for item in rows:
    ${abrupt}
    break
else:
    b = None
from . import b`,
      ),
    ]);

    expect(result.files[0]?.relativeImportCandidates).toEqual([]);
  });

  it.each([
    ["return", "return None", []],
    ["raise", "raise RuntimeError()", [".b"]],
  ] as const)(
    "routes %s through the matching try completion",
    (_, abrupt, relativeImportCandidates) => {
      const result = analyzePython([
        pythonSourceFile(
          "pkg/__init__.py",
          `for item in rows:
    try:
        ${abrupt}
    except Exception:
        break
else:
    b = None
from . import b`,
        ),
      ]);

      expect(result.files[0]?.relativeImportCandidates).toEqual(
        relativeImportCandidates,
      );
    },
  );

  it("keeps bindings definite for an import reached inside loop else", () => {
    const result = analyzePython([
      pythonSourceFile(
        "pkg/__init__.py",
        `for item in rows:
    pass
else:
    b = None
    from . import b`,
      ),
    ]);

    expect(result.files[0]?.relativeImportCandidates).toEqual([]);
  });

  it.each([
    ["simple target before member", "b = missing.attr = None", []],
    ["member before simple target", "missing.attr = b = None", [".b"]],
    ["unpacked target before member", "b, missing.attr = [None, None]", []],
    ["member before unpacked target", "missing.attr, b = [None, None]", [".b"]],
    [
      "nested unpack before member",
      "b, [c, missing.attr] = [None, [None, None]]",
      [],
    ],
    ["short unpack before any target", "b, missing.attr = [None]", [".b"]],
    ["throwing value before any target", "b = missing.attr = risky()", [".b"]],
  ] as const)(
    "tracks partial assignment failure for %s",
    (_, assignment, relativeImportCandidates) => {
      const result = analyzePython([
        pythonSourceFile(
          "pkg/__init__.py",
          `try:
    ${assignment}
except Exception:
    from . import b`,
        ),
      ]);

      expect(result.files[0]?.relativeImportCandidates).toEqual(
        relativeImportCandidates,
      );
    },
  );

  it.each([
    [
      "destructured for targets",
      `for [b, (c,)] in rows:
    from . import b, c`,
      [],
    ],
    [
      "match captures",
      `match value:
    case {"value": b, **rest}:
        from . import b, rest`,
      [],
    ],
    [
      "exception aliases",
      `try:
    risky()
except Exception as b:
    from . import b`,
      [],
    ],
  ] as const)(
    "applies %s before imports in the entered body",
    (_, source, relativeImportCandidates) => {
      const result = analyzePython([
        pythonSourceFile("pkg/__init__.py", source),
      ]);

      expect(result.files[0]?.relativeImportCandidates).toEqual(
        relativeImportCandidates,
      );
    },
  );

  it("fails conservatively instead of overflowing on deeply nested binding flow", () => {
    const depth = 300;
    const nestedBranches = Array.from(
      { length: depth },
      (_, index) => `${"    ".repeat(index + 1)}if True:`,
    ).join("\n");
    const nestedStatementIndent = "    ".repeat(depth + 1);
    const result = analyzePython([
      pythonSourceFile(
        "pkg/__init__.py",
        `b = set
try:
${nestedBranches}
${nestedStatementIndent}del b
${nestedStatementIndent}risky()
except Exception:
    from . import b`,
      ),
    ]);

    expect(result.files[0]?.relativeImportCandidates).toEqual([".b"]);
  });

  it("sorts paths case-insensitively after POSIX normalization with a raw tie-break", () => {
    const files = [
      pythonSourceFile("src/b.py", "def lower_b():\n    return 1"),
      pythonSourceFile("SRC/A.py", "def upper_a():\n    return 1"),
      pythonSourceFile("src/a.py", "def lower_a():\n    return 1"),
      pythonSourceFile("Src/C.py", "def mixed_c():\n    return 1"),
    ];
    const expected = ["SRC/A.py", "src/a.py", "src/b.py", "Src/C.py"];

    expect(analyzePython(files).files.map((file) => file.path)).toEqual(
      expected,
    );
    expect(
      analyzePython([...files].reverse()).files.map((file) => file.path),
    ).toEqual(expected);
  });

  it("keeps CRLF positions aligned and counts except-star as one handler", () => {
    const source = [
      "def inspect(value):",
      "    try:",
      "        return value",
      "    except* ValueError as err:",
      "        raise RuntimeError()",
    ].join("\r\n");
    const result = analyzePython([pythonSourceFile("src/crlf.py", source)]);

    expect(result.functions[0]).toMatchObject({
      startLine: 1,
      endLine: 5,
      logicalLines: 5,
      cyclomatic: 2,
      maxNesting: 1,
      hasErrorHandling: true,
    });
  });

  it("fails closed on deeply malformed input and handles wide frozen input iteratively", () => {
    const malformed = pythonSourceFile(
      "src/deep-broken.py",
      `value = ${"(".repeat(4_000)}1`,
    );
    const wide = Object.freeze(
      pythonSourceFile(
        "src/wide.py",
        `def wide():\n${Array.from(
          { length: 1_500 },
          (_, index) => `    local_${String(index)} = ${String(index)}`,
        ).join("\n")}\n    return local_0`,
      ),
    );
    const input = Object.freeze([malformed, wide]);
    const result = analyzePython(input);

    expect(result.parseFailures).toEqual([
      { path: "src/deep-broken.py", language: "python", reason: "syntax" },
    ]);
    expect(result.files.map((file) => file.path)).toEqual(["src/wide.py"]);
    expect(result.functions[0]?.name).toBe("wide");
    expect(input[1]).toBe(wide);
  });

  it("carries test flags, uses stable path order, and never mutates inputs", () => {
    const testFile = Object.freeze(
      pythonSourceFile("tests/test_z.py", "def z():\n    return 1", {
        isTest: true,
      }),
    );
    const source = Object.freeze(
      pythonSourceFile("src/a.py", "def a():\n    return 1"),
    );
    const input = Object.freeze([testFile, source]);
    const result = analyzePython(input);

    expect(result.files.map((file) => file.path)).toEqual([
      "src/a.py",
      "tests/test_z.py",
    ]);
    expect(
      result.functions.map((metric) => [metric.name, metric.isTest]),
    ).toEqual([
      ["a", false],
      ["z", true],
    ]);
    expect(input[0]).toBe(testFile);
    expect(input[1]).toBe(source);
  });
});
