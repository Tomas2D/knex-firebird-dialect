module.exports = {
  roots: ["tests"],
  collectCoverage: true,
  coverageReporters: ["html", "lcov"],
  coveragePathIgnorePatterns: [
    "node_modules",
    "src/formatter.js",
    "src/schema/ddl.js",
    "src/schema/tablecompiler.js",
  ],
};
