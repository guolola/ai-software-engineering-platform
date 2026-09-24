// Describes the active prompt instructions that administrators may version.
export type CatalogEntry = {
  id: string;
  path: string[];
  instruction: string;
  match: string;
  source: string;
  kind?: "prompt" | "skill" | "locked";
};

const entry = (id: string, path: string[], instruction: string, source: string, match = instruction): CatalogEntry => ({ id, path, instruction, match, source });

export const catalog: CatalogEntry[] = [
  entry("requirements.extract", ["需求建模", "规则抽取"], "请从下面的软件工程实践平台需求中抽取结构化需求规则。", "model-prompts.ts"),
  ...(["context", "function", "usecase", "class", "activity", "deployment", "prototype"] as const).map((kind) =>
    entry(`requirements.model.${kind}`, ["需求建模", "模型生成", kind], "请根据已确认的需求规则和 RequirementBaseline 生成需求阶段 UML 结构化模型。", "model-prompts.ts")),
  entry("requirements.analysis", ["需求建模", "需求分析顺序图"], "请只根据单个用例的事件流，生成需求阶段需求分析顺序图结构化模型。", "model-prompts.ts"),
  entry("requirements.repair", ["需求建模", "模型修复"], "请修复下面不符合要求的 UML 结构化模型 JSON 输出。", "model-prompts.ts"),
  entry("requirements.trace", ["需求建模", "追踪关系生成"], "请为已经生成成功的需求阶段 UML 模型补充元素级可追踪关系。", "model-prompts.ts"),
  entry("requirements.trace-repair", ["需求建模", "追踪关系修复"], "请修复需求模型元素级可追踪关系 JSON。", "model-prompts.ts"),
  entry("requirements.activity-compact", ["需求建模", "超时重试", "总体业务流程"], "请只生成需求阶段总体业务流程 activity 模型。", "requirements-pipeline.ts"),
  entry("requirements.analysis-compact", ["需求建模", "超时重试", "需求分析"], "请只为单个用例生成需求分析顺序图 analysis 模型。", "requirements-pipeline.ts"),
  entry("requirements.rule-repair", ["需求建模", "规则修复", "单条"], "你是需求规则字段级修复助手。只修复当前一条需求规则的结构化字段，不改写原始需求文本，不重新生成全部规则。输出必须是 JSON。", "requirement-rule-repair.ts"),
  entry("requirements.rules-repair", ["需求建模", "规则修复", "批量"], "你是需求规则批量字段级修复助手。一次性为多条需求规则生成结构化字段修复候选，不改写原始需求文本，不重新生成全部规则。输出必须是 JSON。", "requirement-rule-repair.ts"),
  entry("feasibility.context", ["可行性分析", "系统环境图"], "根据已确认需求生成系统上下文结构。", "feasibility-prompts.ts"),
  entry("feasibility.business-flow", ["可行性分析", "业务与系统流程图"], "根据已确认需求规则生成可行性分析阶段的“业务与系统流程图”，使用一张 UML 泳道活动图展示目标系统参与的核心端到端业务流程。", "feasibility-business-flow-prompt.ts"),
  entry("feasibility.implementation", ["可行性分析", "实现方案"], "根据系统环境图、业务与系统流程图、需求基线和补充资料生成恰好 2 个可执行候选方案，两个候选都必须包含完整 implementation；recommendedCandidateId 必须引用其中一个候选方案。", "feasibility-prompts.ts"),
  entry("feasibility.json-repair", ["可行性分析", "业务流程修复"], "仅修复业务与系统流程图的结构、泳道归属、连通性和需求追踪错误，不得编造需求步骤。", "feasibility-prompts.ts"),
  entry("feasibility.plan-repair", ["可行性分析", "方案 JSON 修复"], "只修复校验错误涉及的字段或章节，其余内容必须原样保留。", "feasibility-prompts.ts"),
  entry("feasibility.section-repair", ["可行性分析", "章节修复"], "仅修复候选方案索引", "feasibility-prompts.ts"),
  entry("design.sequence", ["设计建模", "用例实现设计"], "请根据已确认需求项、需求阶段用例模型事件流和需求分析模型生成设计阶段用例实现设计结构化模型。", "model-prompts.ts"),
  ...(["architecture", "class", "activity", "component", "deployment", "table"] as const).map((kind) =>
    entry(`design.model.${kind}`, ["设计建模", "模型生成", kind], "请根据已确认需求项、需求阶段模型和全部用例实现设计生成设计阶段 UML 结构化模型。", "model-prompts.ts")),
  entry("design.repair", ["设计建模", "模型修复"], "请修复下面不符合要求的设计阶段 UML 结构化模型 JSON 输出。", "model-prompts.ts"),
  entry("design.trace", ["设计建模", "追踪关系生成"], "请为已经生成成功的设计阶段 UML 模型补充元素级可追踪关系。", "model-prompts.ts"),
  entry("design.trace-repair", ["设计建模", "追踪关系修复"], "请修复设计模型元素级可追踪关系 JSON。", "model-prompts.ts"),
  entry("code.mockup", ["代码原型", "界面设计图"], "为线上前端原型生成一张高保真主界面设计图，16:9 桌面应用画幅。", "code-prompts.ts"),
  entry("code.mockup-analysis", ["代码原型", "设计图视觉解析"], "请分析随消息一起提供的界面设计图，并提取可直接约束 React 原型实现的视觉参考规格。", "code-prompts.ts"),
  entry("code.ui-ir", ["代码原型", "结构化 UI IR"], "请生成前端原型的结构化 UI IR，用于直接约束 React 代码生成。", "code-prompts.ts"),
  entry("code.business", ["代码原型", "业务逻辑分析"], "请作为前端实现模型分析器，从设计模型、设计 PlantUML、designToCodeMapping 和服务端已确认需求基线中抽取代码生成必须遵守的实现事实。", "code-prompts.ts"),
  entry("code.visual", ["代码原型", "视觉方向"], "请为当前 Web React 原型生成明确的视觉方向 brief，让后续代码生成像优秀官网 demo 一样有清晰风格，而不是普通后台表格。", "code-prompts.ts"),
  entry("code.discovery", ["代码原型", "Skill 资源预览"], "请作为 opencode-like skill runtime 的资源理解步骤，先声明要预览哪些 CSV 资源，再由 API 返回 header 和样例行。", "code-prompts.ts"),
  entry("code.resources", ["代码原型", "Skill 资源查询"], "请作为 opencode-like skill runtime 的规划步骤，阅读 ui-ux-pro-max 的 SKILL.md 摘要和文件清单，自主声明本次生成 React 原型需要查询哪些 skill 资源。", "code-prompts.ts"),
  entry("code.files", ["代码原型", "文件操作生成"], "请作为 ui-ux-pro-max 主设计执行器，根据已冻结的界面方案生成前端原型文件操作。", "code-prompts.ts"),
  entry("code.files-repair", ["代码原型", "文件操作修复"], "请修复下面不符合代码文件操作协议的 JSON 输出。", "code-prompts.ts"),
  entry("code.fidelity", ["代码原型", "界面保真度核验"], "请检查当前 React 原型代码是否覆盖业务逻辑，以及 ui-ux-pro-max 应从业务逻辑推导出的界面方案。", "code-prompts.ts"),
  entry("documents.generate", ["文档与渲染", "文档正文生成"], "请根据平台当前产物生成", "document-prompts.ts"),
  entry("documents.repair", ["文档与渲染", "文档正文修复"], "请修复《", "document-prompts.ts"),
  entry("render.plantuml-repair", ["文档与渲染", "PlantUML 修复"], "请修复下面无法编译或返回占位 SVG 的 PlantUML。", "document-prompts.ts"),
  { id: "shared.json", path: ["共用约束", "JSON 系统指令"], instruction: "你是一个严谨的软件需求与 UML 建模助手。你必须只返回 JSON，不要输出 Markdown、解释或代码围栏。", match: "", source: "model-prompts.ts", kind: "locked" },
  { id: "shared.schema", path: ["共用约束", "结构化输出契约"], instruction: "由代码中的 JSON Schema、输入数据和安全约束生成，不开放编辑。", match: "", source: "response-formats", kind: "locked" },
  { id: "skill.ui-ux-pro-max", path: ["Skill", "UI/UX Pro Max"], instruction: "代码生成使用的 UI/UX Skill。说明、资源和动作本轮只读。", match: "", source: "code-skills/ui-ux-pro-max/SKILL.md", kind: "skill" },
];

export const catalogById = new Map(catalog.map((item) => [item.id, item]));

export function findPromptForMessage(content: string): CatalogEntry | null {
  if (content.startsWith("请根据已确认的需求规则和 RequirementBaseline 生成需求阶段 UML 结构化模型。")) {
    const kind = content.match(/只生成以下图类型：\s*\n([^\n]+)/u)?.[1]?.trim();
    return catalogById.get(`requirements.model.${kind}`) ?? null;
  }
  if (content.startsWith("请根据已确认需求项、需求阶段模型和全部用例实现设计生成设计阶段 UML 结构化模型。")) {
    const kind = content.match(/只生成以下设计图类型：\s*\n([^\n]+)/u)?.[1]?.trim();
    return catalogById.get(`design.model.${kind}`) ?? null;
  }
  return catalog.find((item) => item.kind !== "locked" && item.kind !== "skill" && item.match && content.slice(0, 300).includes(item.match)) ?? null;
}
