// 极简模板填充：把 {{var}} 替换为 vars[var]；未定义的占位符替换为空串。
// 仅用于把 MD 文件里的固定段（如 风格样本）注入 prompt，不引入完整模板引擎。

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}
