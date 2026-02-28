/** Jest config — covers all lib and app/api unit tests */
module.exports = {
  testEnvironment: "node",
  roots: [
    "<rootDir>/lib",
    "<rootDir>/app/api",
    "<rootDir>/app/pages",
  ],
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  collectCoverageFrom: [
    "lib/**/*.ts",
    "app/api/**/*.ts",
    "app/pages/**/*.ts",
    "!**/__tests__/**",
    "!**/index.ts",
  ],
};
