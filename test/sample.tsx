import { test, test2 } from "./ESImport";
import { foo as NotSupported } from "./RenameNotSupported";
import * as starName from "./StarImport";
import DefaultImport, { NamedImport } from "./DefaultAndNamed";
import { ignoreFolderIndex } from "./folder";
const constGlobalRequire = require("const-global-require");
let letGlobalRequire = require("let-global-require");
var varGlobalRequire = require("var-global-require");
require("static-require");

export { x } from "./a";

let t1 = {};
type t2 = typeof t1;

const obj = {
  letGlobalRequire: (foo: test) => {
    async function varGlobalRequire() {
      const nonglobalRequire = require("nonglobal-require");
      await import("/modules/my-module.js");

      constGlobalRequire.prop = 5;
      letGlobalRequire = { [test]: true };
      const varGlobalRequire = {
        foo: "13",
      };
      test();
      test2();
      rename();
      DefaultImport();
      const val = (53 + 5) as test;
      try {
        obj.constGlobalRequire = varGlobalRequire;
      } catch (letGlobalRequire) {}

      const jsx = <DefaultImport loading />;
    }

    class constGlobalRequire {
      letGlobalRequire() {}
    }
  },
  varGlobalRequire() {},
};
