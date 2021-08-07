"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true,
});

exports.default = function ({ types: t }) {
  const visitor = {
    Program(path) {
      const declarations = new Map();
      const importsVar = path.scope.generateUidIdentifier("imports");

      // Collect up the declarations
      path.traverse(requireDeclarationVisitor, { declarations });
      path.traverse(importDeclarationVisitor, { declarations });

      // Add the variables off to the side where we'll store our
      // resolved imports (for handling setters)
      const variableDeclarations = [];
      for (const [name, value] of declarations) {
        value.identifier = path.scope.generateUidIdentifier(name + "InitObj");
        variableDeclarations.push(
          t.variableDeclaration("const", [
            t.variableDeclarator(
              value.identifier,
              t.objectExpression([
                t.objectProperty(
                  t.identifier("initialized"),
                  t.booleanLiteral(false)
                ),
              ])
            ),
          ])
        );
      }
      variableDeclarations.reverse();

      const properties = [];
      const moduleImports = new Map();
      for (const [
        name,
        { identifier, requireString, isConst },
      ] of declarations) {
        if (moduleImports.has(requireString)) {
          continue;
        }
        const nameIdentifier = path.scope.generateUidIdentifier(requireString);
        moduleImports.set(requireString, nameIdentifier.name);
        const initializedIdentifier = t.identifier("initialized");
        const initializedMember = t.memberExpression(
          identifier,
          initializedIdentifier
        );
        const valueIdentifier = t.identifier("value");
        const valueMember = t.memberExpression(identifier, valueIdentifier);
        const requireExpression = t.callExpression(t.identifier("require"), [
          t.stringLiteral(requireString),
        ]);

        properties.push(
          t.objectMethod(
            "get",
            nameIdentifier,
            [],
            t.blockStatement([
              t.ifStatement(
                t.unaryExpression("!", initializedMember),
                t.blockStatement([
                  t.expressionStatement(
                    t.assignmentExpression("=", valueMember, requireExpression)
                  ),
                  t.expressionStatement(
                    t.assignmentExpression(
                      "=",
                      initializedMember,
                      t.booleanLiteral(true)
                    )
                  ),
                ])
              ),
              t.returnStatement(valueMember),
            ])
          )
        );

        // Add a setter if this can be modified
        if (!isConst) {
          properties.push(
            t.objectMethod(
              "set",
              nameIdentifier,
              [valueIdentifier],
              t.blockStatement([
                // We do the require if setting before getting since it's
                // the only chance we'll have to initialize (in case there
                // is some code in the module that needed to run)
                t.ifStatement(
                  t.unaryExpression("!", initializedMember),
                  t.blockStatement([
                    t.expressionStatement(requireExpression),
                    t.expressionStatement(
                      t.assignmentExpression(
                        "=",
                        initializedMember,
                        t.booleanLiteral(true)
                      )
                    ),
                  ])
                ),
                t.expressionStatement(
                  t.assignmentExpression("=", valueMember, valueIdentifier)
                ),
              ])
            )
          );
        }
      }

      // Perform the replacements in the rest of the codebase
      path.traverse(requireUsagesVisitor, {
        declarations,
        requireScope: path.scope,
        importsVar,
        moduleImports,
      });

      path.unshiftContainer(
        "body",
        t.variableDeclaration("const", [
          t.variableDeclarator(importsVar, t.objectExpression(properties)),
        ])
      );
      for (const declaration of variableDeclarations) {
        path.unshiftContainer("body", declaration);
      }
    },
  };

  const requireDeclarationVisitor = {
    VariableDeclaration(path) {
      // TODO: support nonglobal declarations
      if (!t.isProgram(path.parent)) {
        // We don't care about nonglobal declarations (for now)
        return;
      }

      path.traverse(
        {
          VariableDeclarator(path) {
            if (
              !t.isIdentifier(path.node.id) ||
              !t.isCallExpression(path.node.init) ||
              !t.isIdentifier(path.node.init.callee, { name: "require" }) ||
              path.node.init.arguments.length !== 1 ||
              !t.isLiteral(path.node.init.arguments[0])
            ) {
              return;
            }

            this.declarations.set(path.node.id.name, {
              node: path.node,
              isConst: path.parent.kind === "const",
              requireString: path.node.init.arguments[0].value,
            });

            // Since this is going to be replaced, we don't need it any more
            path.remove();
          },
        },
        { declarations: this.declarations }
      );
    },
  };

  const importDeclarationVisitor = {
    ImportDeclaration(path) {
      const source = path.node.source;
      let unsupportedImport = false;
      const declarationsToAdd = [];

      path.traverse({
        ImportNamespaceSpecifier(path) {
          unsupportedImport = true;
        },
        ImportDefaultSpecifier(path) {
          declarationsToAdd.push([
            path.node.local.name,
            {
              node: path.node,
              isConst: true,
              requireString: path.node.local.name,
            },
          ]);
        },
        ImportSpecifier(path) {
          if (
            !t.isIdentifier(path.node.imported) ||
            !t.isIdentifier(path.node.local) ||
            path.node.imported.name != path.node.local.name
          ) {
            unsupportedImport = true;
            return;
          }

          declarationsToAdd.push([
            path.node.imported.name,
            {
              node: path.node,
              isConst: true,
              requireString: source.value,
              moduleMember: path.node.imported.name,
            },
          ]);
        },
      });

      if (unsupportedImport) {
        return;
      }

      declarationsToAdd.forEach(([name, value]) => {
        this.declarations.set(name, value);
      });

      // Since this is going to be replaced, we don't need it any more
      path.remove();
    },
  };

  const requireUsagesIdentifier = ({
    path,
    requireScope,
    declarations,
    importsVar,
    moduleImports,
    isJSX,
  }) => {
    // We don't care about declarations
    if (
      ((t.isVariableDeclarator(path.parent) ||
        t.isFunctionDeclaration(path.parent)) &&
        path.parent.id === path.node) ||
      ((t.isObjectProperty(path.parent) || t.isObjectMethod(path.parent)) &&
        path.parent.key === path.node)
    ) {
      return;
    }

    // We also don't care about something that has been accessed
    // off of a parent object (e.g. the `b` in `a.b`)
    if (
      t.isMemberExpression(path.parent) &&
      path.parent.property === path.node
    ) {
      return;
    }

    // We also don't care about class methods or properties
    if (
      ["MethodDefinition", "ClassMethod"].some(
        (type) => path.parent.type === type
      ) &&
      path.parent.key === path.node
    ) {
      return;
    }

    // If a binding is found, but either isn't derived from the same
    // scope as our requires or isn't in our declarations map, we
    // can't do anything with it
    const binding = path.scope.bindings[path.node.name];
    if (binding && binding.scope !== requireScope) {
      return;
    }

    // If we don't have it in our declarations map, then it must be
    // something else, skip
    if (!declarations.has(path.node.name)) {
      return;
    }

    function memberExpression(a, b) {
      return isJSX ? t.jSXMemberExpression(a, b) : t.memberExpression(a, b);
    }
    function identifier(a) {
      return isJSX ? t.jSXIdentifier(a) : t.identifier(a);
    }

    console.log(t);
    let useLazyImportExpression = memberExpression(
      identifier(importsVar.name),
      identifier(
        moduleImports.get(declarations.get(path.node.name).requireString)
      )
    );

    const moduleMember = declarations.get(path.node.name).moduleMember;
    if (moduleMember) {
      useLazyImportExpression = memberExpression(
        useLazyImportExpression,
        identifier(moduleMember)
      );
    }

    path.replaceWith(useLazyImportExpression);

    // Don't process the value we just inserted
    path.skip();
  };

  const requireUsagesVisitor = {
    TSEntityName(path) {
      path.skip();
    },

    JSXIdentifier(path) {
      requireUsagesIdentifier({
        path,
        requireScope: this.requireScope,
        declarations: this.declarations,
        importsVar: this.importsVar,
        moduleImports: this.moduleImports,
        isJSX: true,
      });
    },

    Identifier(path) {
      requireUsagesIdentifier({
        path,
        requireScope: this.requireScope,
        declarations: this.declarations,
        importsVar: this.importsVar,
        moduleImports: this.moduleImports,
      });
    },
  };

  return { visitor };
};
