
const { listPostsByChannel, listModerationLogs } = require("../store");
const { getEditableMeta } = require("./postEditorService");

function pushAlert(list, item) {
  list.push({
    id: `${item.type}_${item.refId || item.commentKey || item.channelId || Math.random().toString(36).slice(2,8)}`,
    createdAt: item.createdAt || Date.now(),
    severity: item.severity || "info",
    ...item
  });
}

function severityRank(value = "info") {
  return { critical: 4, high: 3, medium: 2, info: 1 }[String(value || "info")] || 1;
}

function listChannelAlerts({ channelId = "", config = {}, limit = 20 } = {}) {
  const alerts = [];
  const posts = listPostsByChannel(channelId, 200);
  const now = Date.now();

  posts.forEach((post) => {
    const editable = getEditableMeta(post, config);
    if (post.lastPatchError) {
      pushAlert(alerts, {
        type: "patch_error",
        severity: "critical",
        channelId: post.channelId,
        commentKey: post.commentKey,
        postId: post.postId,
        title: "Ошибка перепатчивания поста",
        message: post.lastPatchError.message || "patch_failed",
        createdAt: post.lastPatchAttemptAt || post.updatedAt || now
      });
    }
    if (editable.editable && editable.msLeft <= 2 * 60 * 60 * 1000) {
      pushAlert(alerts, {
        type: "edit_window_closing",
        severity: "medium",
        channelId: post.channelId,
        commentKey: post.commentKey,
        postId: post.postId,
        title: "Окно редактирования скоро закроется",
        message: `До конца окна редактирования осталось менее 2 часов для postId ${post.postId || ""}`,
        createdAt: now
      });
    }
    if (!editable.editable && editable.deadlineAt) {
      pushAlert(alerts, {
        type: "edit_window_expired",
        severity: "info",
        channelId: post.channelId,
        commentKey: post.commentKey,
        postId: post.postId,
        title: "Окно редактирования закрыто",
        message: `Пост ${post.postId || ""} больше нельзя редактировать из Amio`,
        createdAt: editable.deadlineAt
      });
    }
  });

  const moderationLogs = listModerationLogs({ channelId, limit: 500 }).filter((item) => (now - Number(item.createdAt || 0)) <= 24 * 60 * 60 * 1000);
  const queued = moderationLogs.filter((item) => item.decision === "queued" && !item.resolvedAt);
  const blocked = moderationLogs.filter((item) => item.decision === "blocked");

  if (queued.length) {
    pushAlert(alerts, {
      type: "moderation_queue",
      severity: "high",
      channelId,
      refId: 'moderation_queue',
      title: "Есть очередь модерации",
      message: `Неразобранных комментариев в очереди: ${queued.length}`,
      createdAt: queued[0].createdAt || now,
      meta: { queued: queued.length }
    });
  }

  if (blocked.length >= 5) {
    pushAlert(alerts, {
      type: "moderation_spike",
      severity: "medium",
      channelId,
      refId: 'moderation_spike',
      title: "Всплеск блокировок",
      message: `За последние 24 часа заблокировано ${blocked.length} комментариев`,
      createdAt: blocked[0].createdAt || now,
      meta: { blocked: blocked.length }
    });
  }

  return alerts
    .sort((a, b) => {
      const bySeverity = severityRank(b.severity) - severityRank(a.severity);
      if (bySeverity) return bySeverity;
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    })
    .slice(0, Math.max(1, Math.min(Number(limit || 20), 100)));
}

module.exports = {
  listChannelAlerts
};
