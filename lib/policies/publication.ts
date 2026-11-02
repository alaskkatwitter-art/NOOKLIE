export function policyPublicationIssues(content: string): string[] {
  const missing = [...content.matchAll(/\[PREENCHER\s+([^\]]+)\]/g)].map((match) => match[1].trim());
  return [...new Set(missing)];
}
