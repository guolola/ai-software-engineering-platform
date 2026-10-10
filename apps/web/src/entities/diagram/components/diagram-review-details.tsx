// Renders review summaries for model notices and full diagnostic records for generation transcripts.
import { isExcludedDiagramReviewIssue, type DiagramVisualReview } from "@uml-platform/contracts";
import { reviewProblemGroups, reviewProblemTreatment } from "../lib/review-presentation";

const verificationLabels = { verified: "已核实", unverified: "待核实", inconclusive: "无法核实" };
const formatValue = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value) ?? "未提供";
export function DiagramReviewDetails({ review, confirmed = false, summaryOnly = false }: { review: DiagramVisualReview; confirmed?: boolean; summaryOnly?: boolean }) {
  const groups = summaryOnly ? [] : reviewProblemGroups(review);
  // A summary is informational; a historical pending verdict does not request human acceptance.
  const reason = summaryOnly && review.status === "pending_review"
    ? "检查已结束，原检查结论保留。"
    : isExcludedDiagramReviewIssue(review.reason) ? "当前没有结构问题记录" : review.reason;
  return <section aria-label={summaryOnly ? "视觉检查摘要" : "结构检查详情"} data-slot="diagram-review-details" className="min-w-0 space-y-3 text-sm leading-6 text-black dark:text-foreground">
    <div className="space-y-1">
      <p>{confirmed ? <><span>已人工确认当前图</span>，原检查结论保留。</> : reason}</p>
      <p className="text-xs text-muted-foreground">{review.structureAttempts !== undefined ? `结构核对 ${review.structureAttempts} 次 · 图片检查 ${review.attempts} 次 · ${review.repairAttempts === undefined ? "纠错尝试次数未记录" : `纠错尝试 ${review.repairAttempts} 次`}` : `已检查 ${review.attempts} 次；${review.repairAttempts === undefined ? "自动修复次数未记录" : `已尝试自动修复 ${review.repairAttempts} 次`}`}</p>
      {!summaryOnly && review.checkOutcome === "skipped" && <p>检查已跳过：{review.stopReason ?? reason}</p>}
      {!summaryOnly && review.stopReason && !isExcludedDiagramReviewIssue(review.stopReason) && <p className="break-words">停止原因：{review.stopReason}</p>}
    </div>
    {groups.map((group) => <section key={group.category} aria-label={group.label} className="space-y-2 border-t pt-2">
      <h4 className="text-sm font-medium">{group.label}（{group.items.length}）</h4>
      <ul className="space-y-2">{group.items.map((problem) => <li key={problem.id} className="min-w-0 space-y-1">
        <p className="break-words"><span className="text-xs text-muted-foreground">{verificationLabels[problem.verification]}：{problem.inferred ? "（根据描述分类）" : ""}</span>{problem.observation}</p>
        <p className="break-words text-xs text-muted-foreground">{reviewProblemTreatment(problem, review)}</p>
        <details className="text-xs">
          <summary className="w-fit cursor-pointer">查看问题依据与处理详情</summary>
          <div className="mt-1 space-y-1 whitespace-pre-wrap break-words">
            {problem.finding ? <>
              <p>对应模型：{problem.finding.modelId}</p>
              {(problem.finding.elementId || problem.finding.relationshipId) && <p>对应元素／关系：{problem.finding.elementId ?? problem.finding.relationshipId}</p>}
              {problem.finding.path && <p>字段：{problem.finding.path}</p>}
              {"expected" in problem.finding && <p>预期值：{formatValue(problem.finding.expected)}</p>}
              {"actual" in problem.finding && <p>实际值：{formatValue(problem.finding.actual)}</p>}
              {problem.finding.evidence.length ? <ul>{problem.finding.evidence.map((item, index) => <li key={index}>依据：{item.reference} · {item.detail}</li>)}</ul> : <p>当前没有可核实的依据记录。</p>}
            </> : <p>该记录没有结构化依据；文字分类不代表问题已核实。</p>}
          </div>
        </details>
      </li>)}</ul>
    </section>)}
    {!summaryOnly && !!review.repairHistory?.length && <details className="border-t pt-2 text-xs">
      <summary className="w-fit cursor-pointer">修复记录（{review.repairHistory.length}）</summary>
      <ul className="mt-2 space-y-2">{review.repairHistory.map((repair, index) => <li key={repair.callId ?? `${repair.round}:${index}`}>
        <p>第 {repair.round} 轮{repair.target === "model" ? "结构纠错" : "图形重建"}：{repair.status === "accepted" ? "已接受" : repair.status === "rejected" ? "已拒绝" : "未完成"} · {repair.reason}</p>
        {repair.changes.map((change, index) => <p key={index} className="break-words">{change}</p>)}
      </li>)}</ul>
    </details>}
  </section>;
}
