const js = require("@eslint/js");
const jest = require("eslint-plugin-jest");
const prettier = require("eslint-config-prettier");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  prettier,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2015,
      },
    },
  },
  {
    files: ["tests/*.js"],
    plugins: { jest },
    languageOptions: {
      globals: globals.jest,
    },
  },
];
