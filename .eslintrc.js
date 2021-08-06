module.exports = {
  extends: ["eslint:recommended", "prettier"],
  plugins: ["jest"],
  env: {
    node: true,
    es6: true,
  },
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 2017,
  },
  overrides: [
    {
      files: ["tests/*.js"],
      env: {
        jest: true,
      },
    },
  ],
};
