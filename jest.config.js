/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["**/tests/**/*.test.js"],
  // Since we use global functions (no ES modules), we load source files via
  // setupFiles so they're available as globals in the test environment.
  setupFiles: [
    "./tests/setup-globals.js",
  ],
};
