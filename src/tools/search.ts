// Tool search shared by the sidebar and the home page. Pure (no DOM).
import { CATEGORIES, TOOLS, type Category, type ToolMeta } from './meta'

/** Every whitespace-separated term must match the title, description, keywords or id. */
export function filterTools(query: string, tools: ToolMeta[] = TOOLS): ToolMeta[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return tools
  return tools.filter((t) => {
    const haystack = [t.title, t.description, t.id, ...t.keywords].join(' ').toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

export interface ToolGroup {
  category: Category
  tools: ToolMeta[]
}

export function groupByCategory(tools: ToolMeta[]): ToolGroup[] {
  return CATEGORIES.map((category) => ({
    category,
    tools: tools.filter((t) => t.category === category.id),
  })).filter((g) => g.tools.length > 0)
}

export function findTool(path: string): ToolMeta | undefined {
  const id = path.replace(/^\/+/, '')
  return TOOLS.find((t) => t.id === id)
}
