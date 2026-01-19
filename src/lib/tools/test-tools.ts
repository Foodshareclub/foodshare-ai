// Quick validation test for all tools
import { executeTool } from "./index";

async function testTools() {
  console.log("Testing all tools validation...\n");
  
  const tests = [
    // Should fail - missing required params
    { name: "trigger-review", args: {}, expectError: true },
    { name: "trigger-review", args: { repo: "test" }, expectError: true }, // missing pr
    { name: "trigger-review", args: { pr: "5" }, expectError: true }, // missing repo
    { name: "trigger-review", args: { repo: "invalid", pr: "5" }, expectError: true }, // invalid repo format
    { name: "review", args: {}, expectError: true },
    { name: "scan", args: {}, expectError: true },
    { name: "prs", args: {}, expectError: true },
    { name: "add-repo", args: {}, expectError: true },
    { name: "config-repo", args: {}, expectError: true },
    { name: "remove-repo", args: {}, expectError: true },
    { name: "remove-repo", args: { repo: "test" }, expectError: true }, // missing confirm
    { name: "clear-queue", args: {}, expectError: true },
    
    // Should pass - valid params or no required params
    { name: "help", args: {}, expectError: false },
    { name: "stats", args: {}, expectError: false },
    { name: "repos", args: {}, expectError: false },
    { name: "queue", args: {}, expectError: false },
    { name: "reviews", args: {}, expectError: false },
    { name: "scans", args: {}, expectError: false },
    { name: "trends", args: {}, expectError: false },
    { name: "retry", args: {}, expectError: false },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = await executeTool(test.name, test.args as Record<string, string>, { correlationId: "test" });
    const gotError = !result.success;
    const testPassed = gotError === test.expectError;
    
    if (testPassed) {
      passed++;
      console.log(`✓ ${test.name}(${JSON.stringify(test.args)}) - ${test.expectError ? 'correctly rejected' : 'passed'}`);
    } else {
      failed++;
      console.log(`✗ ${test.name}(${JSON.stringify(test.args)}) - expected ${test.expectError ? 'error' : 'success'}, got ${gotError ? 'error' : 'success'}: ${result.error || result.data?.slice(0, 50)}`);
    }
  }
  
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Export for testing
export { testTools };
