/** Parse valid JSON, rejecting duplicate object keys at every nesting level.
 * JSON.parse normally keeps the last value, silently discarding earlier data.
 * Scanning is iterative so deeply nested JSON does not consume the JS call stack.
 */
export function parseJsonUniqueKeys(text: string): unknown {
 const parsed: unknown = JSON.parse(text);
 type Frame = { kind: 'object'; expectingKey: boolean; keys: Set<string> } | { kind: 'array' };
 const stack: Frame[] = [];
 for (let i = 0; i < text.length; i++) {
  const char = text[i];
  if (char === '"') {
   const start = i++;
   let escaped = false;
   while (i < text.length) {
    const current = text[i];
    if (escaped) escaped = false;
    else if (current === '\\') escaped = true;
    else if (current === '"') break;
    i++;
   }
   const frame = stack[stack.length - 1];
   if (frame?.kind === 'object' && frame.expectingKey) {
    // JSON.parse validated the entire input, including string escape sequences.
    const key = JSON.parse(text.slice(start, i + 1)) as string;
    if (frame.keys.has(key)) throw new Error(`Duplicate JSON property ${JSON.stringify(key)} at character ${start + 1}.`);
    frame.keys.add(key);
    frame.expectingKey = false;
   }
  } else if (char === '{') stack.push({kind:'object', expectingKey:true, keys:new Set()});
  else if (char === '[') stack.push({kind:'array'});
  else if (char === '}' || char === ']') stack.pop();
  else if (char === ',') {
   const frame = stack[stack.length - 1];
   if (frame?.kind === 'object') frame.expectingKey = true;
  }
 }
 return parsed;
}
