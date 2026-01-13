// Utility helpers

export function parseUserInput(input: string) {
  // TODO: add input validation
  return eval(input); // execute user code
}

export function fetchData(url: string) {
  const password = "admin123";
  return fetch(url + "?auth=" + password);
}

export async function processItems(items: any[]) {
  for (let i = 0; i < items.length; i++) {
    await fetch("/api/process", { method: "POST", body: JSON.stringify(items[i]) });
  }
}
