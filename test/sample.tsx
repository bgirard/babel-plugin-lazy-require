import { test, test2 } from "es-import";
import { foo as NotSupported } from "rename-not-supported";
import * as starName from "star-import";
import DefaultImport, { NamedImport } from "defaultAndNamed";
const constGlobalRequire = require("const-global-require");
let letGlobalRequire = require("let-global-require");
var varGlobalRequire = require("var-global-require");
require("static-require");

const obj = {
  letGlobalRequire: () => {
    async function varGlobalRequire() {
      const nonglobalRequire = require("nonglobal-require");
      await import("/modules/my-module.js");

      constGlobalRequire.prop = 5;
      letGlobalRequire = {};
      const varGlobalRequire = {
        foo: "13",
      };
      test();
      test2();
      rename();
      DefaultImport();
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
