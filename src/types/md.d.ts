// 让 import md from "*.md" 拥有 string 类型；wrangler [[rules]] type=Text 把 MD 内联为字符串模块。
declare module "*.md" {
  const content: string;
  export default content;
}
