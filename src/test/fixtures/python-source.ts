import type { FetchedTextFile } from "../../features/analysis/model";

import { fetchedTextFile } from "./text-files";

export function pythonSourceFile(
  path: string,
  text: string,
  overrides: Partial<FetchedTextFile> = {},
): FetchedTextFile {
  return fetchedTextFile(path, text, {
    language: "python",
    category: "source",
    ...overrides,
  });
}

export const compactPythonChoiceSource = `def choose(value):
    """Choose a value."""
    if value and value > 1:
        return value
    return 0`;

export const pythonSyntaxCoverageSource = `from .helper import helper as hp
from .. import sibling
from ...core.tools import execute
import external
from package import dependency

async def consume(source):
    async for item in source:
        if item:
            return item

class Service:
    """Public service."""

    def run(self, value, items, other, third):
        """Run the service."""
        for item in items:
            if item:
                value += 1
        while value:
            value -= 1
        try:
            if value:
                raise ValueError("bad")
            elif other:
                value = 1
        except ValueError as err:
            value = 2
        except TypeError:
            value = 3
        choice = value if value else 0
        if value and other or third:
            def inner(flag):
                if flag:
                    return True
                return False
            return inner(value)
        match value:
            case 0:
                return choice
            case 1 if other:
                return other
            case _:
                return third
        return value

def _private(value):
    """Not public API."""
    return value
`;

export const pythonBindingCoverageSource = `from .bindings import q as uv, api
import local_module as zz
from package import remote as xy

short_name = 1
ok = 2

class AB:
    def cd(self, ef, *, gh=1):
        ij = ef
        self.kl = ij
        for mn in []:
            pass
        with open("file") as op:
            pass
        try:
            pass
        except Exception as pq:
            pass
`;

export const malformedPythonSource = "def broken(value:\n    return value";

export const pythonStubImportSource = `from .runtime import RuntimeValue
from .model import Model

class DeclaredValue(RuntimeValue): ...`;
