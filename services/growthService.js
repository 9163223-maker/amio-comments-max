const {
  store,
  getPostsList,
  getPost,
  getComments,
  getGrowthSettings,
  listGrowthClicks,
  listGrowthPollVotes,
  addGrowthClick,
  saveGrowthPollVote,
  saveChannelMemberSnapshot,
  listChannelMemberSnapshots
} = require("../store");
const { getChat, getAllChatMembers } = require("./maxApi");


function getSnapshotAround(channelId = "", targetTs = 0) {
  const items = listChannelMemberSnapshots(channelId);
  if (!items.length) return null;
  let best = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const delta = Math.abs(Number(item?.capturedAt || 0) - Number(targetTs || 0));
    if (delta < bestDelta) {
      best = item;
      bestDelta = delta;
    }
  }
  return best;
}

function summarizeMemberDelta(currentSnapshot = null, previousSnapshot = null) {
  if (!currentSnapshot) return null;
  const currentIds = new Set(Array.isArray(currentSnapshot.memberIds) ? currentSnapshot.memberIds.map((item) => String(item || "").trim()).filter(Boolean) : []);
  const previousIds = new Set(Array.isArray(previousSnapshot?.memberIds) ? previousSnapshot.memberIds.map((item) => String(item || "").trim()).filter(Boolean) : []);
  if (!previousIds.size || !currentIds.size) {
    return {
      joined: null,
      left: null,
      net: Number(currentSnapshot.memberCount || 0) - Number(previousSnapshot?.memberCount || 0),
      hasExactSets: false
    };
  }
  let joined = 0;
  let left = 0;
  for (const id of currentIds) if (!previousIds.has(id)) joined += 1;
  for (const id of previousIds) if (!currentIds.has(id)) left += 1;
  return { joined, left, net: joined - left, hasExactSets: true };
}

async function captureChannelAudienceSnapshot({ channelId = "", config = {}, includeMembers = true } = {}) {
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedChannelId || !config?.botToken) return null;
  const chat = await getChat({ botToken: config.botToken, chatId: normalizedChannelId });
  const memberCountRaw = chat?.members_count ?? chat?.participants_count ?? chat?.membersCount ?? null;
  const memberCount = memberCountRaw === null || memberCountRaw === undefined || Number.isNaN(Number(memberCountRaw)) ? null : Number(memberCountRaw);
  let memberIds = [];
  if (includeMembers) {
    try {
      const members = await getAllChatMembers({ botToken: config.botToken, chatId: normalizedChannelId, pageSize: 100, limit: 20000 });
      memberIds = members.map((item) => String(item?.user_id || item?.id || "").trim()).filter(Boolean);
    } catch {}
  }
  return saveChannelMemberSnapshot(normalizedChannelId, {
    capturedAt: Date.now(),
    memberCount: memberCount ?? memberIds.length,
    memberIds,
    source: includeMembers ? "api_members" : "api_chat"
  });
}

function getAudienceTrendSummary(channelId = "", nowTs = Date.now()) {
  const current = listChannelMemberSnapshots(channelId)[0] || null;
  if (!current) return null;
  const snapshot24h = getSnapshotAround(channelId, nowTs - (24 * 60 * 60 * 1000));
  if (!snapshot24h || String(snapshot24h.capturedAt || "") === String(current.capturedAt || "")) {
    return { current, previous24h: null, delta24h: null };
  }
  return {
    current,
    previous24h: snapshot24h,
    delta24h: summarizeMemberDelta(current, snapshot24h)
  };
}

function normalizePostIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function filterForPost(items = [], postId = "") {
  const normalizedPostId = String(postId || "").trim();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const postIds = normalizePostIds(item.postIds || []);
    if (!postIds.length) return true;
    return Boolean(normalizedPostId) && postIds.includes(normalizedPostId);
  });
}

function chunkButtons(items = [], size = 2) {
  const rows = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

function getBrandingState(channelId = "", config = {}) {
  const settings = getGrowthSettings(channelId);
  const planTier = String(settings.planTier || "free").trim() || "free";
  const isFree = planTier === "free";
  const showBranding = isFree || !settings.whiteLabelEnabled;
  const brandName =
    (settings.agencyMode && settings.agencyBrandName) ||
    settings.brandName ||
    config.growthDefaultBrandName ||
    "Amio";
  const leadMagnetUrl = String(
    settings.leadMagnetUrl ||
      config.growthDefaultLeadMagnetUrl ||
      config.maxDeepLinkBase ||
      config.appBaseUrl ||
      ""
  ).trim();

  return {
    planTier,
    isFree,
    showBranding,
    brandName,
    brandUrl: String(settings.brandUrl || "").trim(),
    leadMagnetUrl,
    leadMagnetText: String(settings.leadMagnetText || "Подключить такие же комментарии в свой канал").trim() || "Подключить такие же комментарии в свой канал",
    keyboardLeadMagnetEnabled: Boolean(settings.keyboardLeadMagnetEnabled),
    leadMagnetEnabled: Boolean(settings.leadMagnetEnabled),
    agencyMode: Boolean(settings.agencyMode),
    whiteLabelEnabled: Boolean(settings.whiteLabelEnabled)
  };
}

function buildTrackedUrl({ appBaseUrl, channelId, buttonId, postId, commentKey, source = "button" }) {
  const base = String(appBaseUrl || "").trim().replace(/\/$/, "");
  const query = new URLSearchParams();
  if (postId) query.set("postId", String(postId || "").trim());
  if (commentKey) query.set("commentKey", String(commentKey || "").trim());
  if (source) query.set("source", String(source || "").trim());
  return `${base}/go/${encodeURIComponent(String(channelId || "").trim())}/${encodeURIComponent(String(buttonId || "").trim())}?${query.toString()}`;
}

function buildGrowthKeyboardRows({ appBaseUrl, channelId, postId, commentKey, config = {} } = {}) {
  const settings = getGrowthSettings(channelId);
  const branding = getBrandingState(channelId, config);
  const buttonRows = chunkButtons(
    filterForPost(settings.trackedButtons, postId).filter((item) => item?.enabled !== false).map((item) => ({
      type: "link",
      text: String(item.text || "").trim(),
      url: buildTrackedUrl({
        appBaseUrl,
        channelId,
        buttonId: item.id,
        postId,
        commentKey,
        source: "button"
      })
    })),
    2
  );

  const rows = [...buttonRows];
  if (branding.showBranding && branding.keyboardLeadMagnetEnabled && branding.leadMagnetEnabled && branding.leadMagnetUrl) {
    rows.push([
      {
        type: "link",
        text: `🚀 ${branding.leadMagnetText}`.slice(0, 64),
        url: buildTrackedUrl({
          appBaseUrl,
          channelId,
          buttonId: "__lead_magnet__",
          postId,
          commentKey,
          source: "lead"
        }) + `&target=${encodeURIComponent(branding.leadMagnetUrl)}`
      }
    ]);
  }
  return rows;
}

function getPublicGrowthData({ channelId = "", postId = "", commentKey = "", currentUserId = "", config = {} } = {}) {
  const settings = getGrowthSettings(channelId);
  const branding = getBrandingState(channelId, config);
  const visibleButtons = filterForPost(settings.trackedButtons, postId)
    .filter((item) => item?.enabled !== false)
    .map((item) => ({
      id: item.id,
      text: item.text,
      style: item.style || "primary",
      trackedUrl: buildTrackedUrl({ appBaseUrl: config.appBaseUrl, channelId, buttonId: item.id, postId, commentKey, source: "button" })
    }));

  const poll = settings.poll || {};
  const pollVisible = poll.enabled && (!poll.postIds?.length || normalizePostIds(poll.postIds).includes(String(postId || "").trim()));
  let pollData = null;
  if (pollVisible) {
    const votes = listGrowthPollVotes({ channelId, pollId: poll.id });
    const totalVotes = votes.length;
    const counts = {};
    for (const option of poll.options || []) counts[option.id] = 0;
    for (const vote of votes) {
      counts[vote.optionId] = (counts[vote.optionId] || 0) + 1;
    }
    const myVote = votes.find((item) => String(item.userId || "") === String(currentUserId || "").trim());
    pollData = {
      id: poll.id,
      question: poll.question,
      totalVotes,
      allowRevote: Boolean(poll.allowRevote),
      myVote: myVote?.optionId || "",
      options: (poll.options || []).map((option) => ({
        id: option.id,
        text: option.text,
        votes: counts[option.id] || 0
      }))
    };
  }

  const leadMagnetTrackedUrl = branding.leadMagnetUrl
    ? buildTrackedUrl({
        appBaseUrl: config.appBaseUrl,
        channelId,
        buttonId: "__lead_magnet__",
        postId,
        commentKey,
        source: "lead"
      }) + `&target=${encodeURIComponent(branding.leadMagnetUrl)}`
    : "";

  return {
    branding: {
      showBranding: branding.showBranding,
      brandName: branding.brandName,
      brandUrl: branding.brandUrl,
      agencyMode: branding.agencyMode,
      planTier: branding.planTier
    },
    leadMagnet: {
      enabled: branding.showBranding && branding.leadMagnetEnabled,
      text: branding.leadMagnetText,
      targetUrl: branding.leadMagnetUrl,
      trackedUrl: leadMagnetTrackedUrl
    },
    trackedButtons: visibleButtons,
    poll: pollData
  };
}

function recordGrowthClick({ channelId = "", buttonId = "", postId = "", commentKey = "", userId = "", config = {}, source = "button", buttonTextOverride = "", targetUrlOverride = "" } = {}) {
  const settings = getGrowthSettings(channelId);
  const branding = getBrandingState(channelId, config);
  let button = (settings.trackedButtons || []).find((item) => String(item.id || "") === String(buttonId || ""));
  let targetUrl = "";
  let buttonText = "";

  if (button) {
    targetUrl = String(button.url || "").trim();
    buttonText = String(button.text || "").trim();
  } else if (String(buttonId || "") === "__lead_magnet__") {
    targetUrl = branding.leadMagnetUrl;
    buttonText = branding.leadMagnetText;
  }

  if (String(buttonTextOverride || "").trim()) buttonText = String(buttonTextOverride || "").trim();
  if (String(targetUrlOverride || "").trim()) targetUrl = String(targetUrlOverride || "").trim();

  const click = addGrowthClick({
    channelId,
    buttonId,
    buttonText,
    targetUrl,
    userId,
    commentKey,
    postId,
    source
  });

  return { click, targetUrl, buttonText };
}

function voteInPoll({ channelId = "", postId = "", commentKey = "", userId = "", optionId = "" } = {}) {
  const settings = getGrowthSettings(channelId);
  const poll = settings.poll || {};
  if (!poll.enabled) {
    throw new Error("poll_disabled");
  }
  if (poll.postIds?.length && !normalizePostIds(poll.postIds).includes(String(postId || "").trim())) {
    throw new Error("poll_not_available_for_post");
  }
  const option = (poll.options || []).find((item) => String(item.id || "") === String(optionId || ""));
  if (!option) throw new Error("poll_option_not_found");

  const vote = saveGrowthPollVote({
    channelId,
    pollId: poll.id,
    optionId,
    userId: String(userId || "guest").trim() || "guest",
    commentKey,
    postId,
    allowRevote: Boolean(poll.allowRevote)
  });

  return { vote };
}

async function buildAnalyticsSummary(channelId = "", config = {}) {
  const normalizedChannelId = String(channelId || "").trim();
  const posts = getPostsList().filter((post) => {
    if (!normalizedChannelId) return true;
    return String(post.channelId || "") === normalizedChannelId;
  });

  const commentKeys = posts.map((post) => String(post.commentKey || "").trim()).filter(Boolean);
  const comments = commentKeys.flatMap((commentKey) => getComments(commentKey).map((item) => ({ ...item, commentKey })));
  const commenters = new Set(comments.map((item) => String(item.userId || item.userName || "").trim()).filter(Boolean));

  const reactionTotal = commentKeys.reduce((sum, commentKey) => {
    const reactionMap = store.reactions?.[commentKey] || {};
    let count = 0;
    Object.values(reactionMap).forEach((byEmoji) => {
      Object.values(byEmoji || {}).forEach((byUser) => {
        Object.values(byUser || {}).forEach((isOn) => {
          if (isOn) count += 1;
        });
      });
    });
    return sum + count;
  }, 0);

  const clicks = listGrowthClicks({ channelId: normalizedChannelId, limit: 500 });
  const uniqueClickers = new Set(clicks.map((item) => String(item.userId || "").trim()).filter(Boolean));
  const topButtonsMap = new Map();
  clicks.forEach((click) => {
    const key = String(click.buttonId || "");
    if (!key) return;
    const item = topButtonsMap.get(key) || { buttonId: key, text: click.buttonText || key, count: 0 };
    item.count += 1;
    topButtonsMap.set(key, item);
  });

  const pollVotes = listGrowthPollVotes({ channelId: normalizedChannelId });
  const gifts = (store.gifts?.campaigns ? Object.values(store.gifts.campaigns) : []).filter((item) => !normalizedChannelId || String(item.channelId || "") === normalizedChannelId);
  const topPosts = posts
    .map((post) => {
      const postComments = getComments(post.commentKey);
      const reactionMap = store.reactions?.[post.commentKey] || {};
      let postReactions = 0;
      Object.values(reactionMap).forEach((byEmoji) => {
        Object.values(byEmoji || {}).forEach((byUser) => {
          Object.values(byUser || {}).forEach((isOn) => {
            if (isOn) postReactions += 1;
          });
        });
      });
      const postClicks = listGrowthClicks({ channelId: post.channelId, limit: 5000 }).filter((item) => String(item?.postId || '').trim() === String(post.postId || '').trim() || String(item?.commentKey || '').trim() === String(post.commentKey || '').trim()).length;
      const postPollVotes = listGrowthPollVotes({ channelId: post.channelId }).filter((item) => String(item?.postId || '').trim() === String(post.postId || '').trim() || String(item?.commentKey || '').trim() === String(post.commentKey || '').trim()).length;
      return {
        commentKey: post.commentKey,
        postId: post.postId,
        text: String(post.originalText || '').slice(0, 120),
        comments: postComments.length,
        reactions: postReactions,
        clicks: postClicks,
        pollVotes: postPollVotes,
        score: (postComments.length * 5) + (postReactions * 2) + postClicks + postPollVotes
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const topCommentersMap = new Map();
  comments.forEach((item) => {
    const key = String(item.userId || item.userName || "guest").trim();
    const current = topCommentersMap.get(key) || { userId: key, userName: item.userName || key, comments: 0 };
    current.comments += 1;
    topCommentersMap.set(key, current);
  });

  const moderationLogs = (store.moderation?.logs || []).filter((item) => !normalizedChannelId || String(item.channelId || "") === normalizedChannelId);
  const blocked = moderationLogs.filter((item) => item.decision === "blocked").length;

  let channelInfo = { channelId: normalizedChannelId, title: normalizedChannelId || '', memberCount: null, live: false };
  if (normalizedChannelId && config?.botToken) {
    try {
      const chat = await getChat({ botToken: config.botToken, chatId: normalizedChannelId });
      const rawMembers = chat?.members_count ?? chat?.participants_count ?? chat?.membersCount ?? null;
      channelInfo = {
        channelId: normalizedChannelId,
        title: String(chat?.title || chat?.name || normalizedChannelId).trim() || normalizedChannelId,
        memberCount: rawMembers === null || rawMembers === undefined || Number.isNaN(Number(rawMembers)) ? null : Number(rawMembers),
        live: true
      };
    } catch {}
  }

  const audience = getAudienceTrendSummary(normalizedChannelId);

  return {
    channelId: normalizedChannelId,
    channelInfo,
    audience,
    totals: {
      posts: posts.length,
      comments: comments.length,
      commenters: commenters.size,
      reactions: reactionTotal,
      clicks: clicks.length,
      uniqueClickers: uniqueClickers.size,
      pollVotes: pollVotes.length,
      moderationBlocked: blocked,
      gifts: gifts.length
    },
    topPosts,
    topCommenters: [...topCommentersMap.values()].sort((a, b) => b.comments - a.comments).slice(0, 10),
    topButtons: [...topButtonsMap.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    recentClicks: clicks.slice(0, 30)
  };
}


function buildPostAnalytics(commentKey = "") {
  const normalizedCommentKey = String(commentKey || '').trim();
  const post = getPost(normalizedCommentKey);
  if (!post) return null;
  const comments = getComments(normalizedCommentKey);
  const reactionMap = store.reactions?.[normalizedCommentKey] || {};
  let reactions = 0;
  Object.values(reactionMap).forEach((byEmoji) => {
    Object.values(byEmoji || {}).forEach((byUser) => {
      Object.values(byUser || {}).forEach((isOn) => { if (isOn) reactions += 1; });
    });
  });
  const clicks = listGrowthClicks({ channelId: post.channelId, limit: 5000 }).filter((item) => String(item?.postId || '').trim() === String(post.postId || '').trim() || String(item?.commentKey || '').trim() === normalizedCommentKey);
  const pollVotes = listGrowthPollVotes({ channelId: post.channelId }).filter((item) => String(item?.postId || '').trim() === String(post.postId || '').trim() || String(item?.commentKey || '').trim() === normalizedCommentKey);
  const uniqueUsers = new Set(comments.map((item) => String(item.userId || item.userName || '').trim()).filter(Boolean));
  const gifts = (store.gifts?.campaigns ? Object.values(store.gifts.campaigns) : []).filter((item) => String(item?.channelId || '').trim() === String(post.channelId || '').trim() && Array.isArray(item?.postIds) && item.postIds.includes(String(post.postId || '').trim()));
  return {
    commentKey: normalizedCommentKey,
    postId: post.postId,
    channelId: post.channelId,
    title: String(post.originalText || '').slice(0, 160),
    text: String(post.originalText || '').slice(0, 160),
    updatedAt: post.updatedAt || 0,
    gifts: gifts.length,
    totals: {
      comments: comments.length,
      participants: uniqueUsers.size,
      reactions,
      clicks: clicks.length,
      pollVotes: pollVotes.length,
      replies: comments.filter((item) => String(item.replyToId || '').trim()).length
    }
  };
}

module.exports = {
  getBrandingState,
  buildGrowthKeyboardRows,
  getPublicGrowthData,
  recordGrowthClick,
  voteInPoll,
  buildAnalyticsSummary,
  buildPostAnalytics,
  captureChannelAudienceSnapshot,
  getAudienceTrendSummary,
  listGrowthClicks,
  listGrowthPollVotes
};
