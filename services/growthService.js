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
  listChannelMemberSnapshots,
  saveChannel,
  getChannelsList
} = require("../store");
const { getChat, getAllChatMembers } = require("./maxApi");

const AUDIENCE_EVENT_LIMIT = 1200;
const AUDIENCE_SNAPSHOT_LIMIT = 120;
const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function clean(value) { return String(value || "").trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function num(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }
function short(value = "", max = 64) { const s = clean(value).replace(/\s+/g, " "); return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)).trim() + "…"; }
function normalizeMember(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const user = source.user && typeof source.user === "object" ? source.user : source;
  const userId = clean(user.user_id || user.userId || user.id || source.user_id || source.userId || source.id);
  if (!userId) return null;
  return {
    userId,
    username: clean(user.username || source.username || ""),
    firstName: clean(user.first_name || user.firstName || source.first_name || source.firstName || ""),
    lastName: clean(user.last_name || user.lastName || source.last_name || source.lastName || ""),
    name: clean(user.name || source.name || ""),
    isBot: Boolean(user.is_bot || user.isBot || source.is_bot || source.isBot),
    lastActivityTime: num(user.last_activity_time || user.lastActivityTime || source.last_activity_time || source.lastActivityTime || 0),
    updatedAt: Date.now()
  };
}
function memberName(member = {}) {
  const username = clean(member.username);
  if (username) return username.startsWith("@") ? username : "@" + username;
  const full = clean(member.name || [member.firstName, member.lastName].filter(Boolean).join(" "));
  if (full) return short(full, 42);
  const id = clean(member.userId || member.id);
  return id ? `Пользователь ${id.slice(0, 3)}…${id.slice(-4)}` : "Пользователь";
}
function channelRecord(channelId = "") {
  const id = clean(channelId);
  return getChannelsList().find((item) => clean(item.channelId) === id) || { channelId: id };
}
function saveChannelPatch(channelId = "", patch = {}) {
  const id = clean(channelId);
  if (!id) return null;
  return saveChannel(id, { ...channelRecord(id), ...patch, channelId: id });
}
function channelAudience(channelId = "") {
  const channel = channelRecord(channelId);
  return {
    channel,
    profiles: channel.audienceProfiles && typeof channel.audienceProfiles === "object" ? channel.audienceProfiles : {},
    snapshots: arr(channel.audienceSnapshots).sort((a, b) => num(b.capturedAt) - num(a.capturedAt)),
    events: arr(channel.audienceEvents).sort((a, b) => num(b.createdAt) - num(a.createdAt))
  };
}
function sourceLabel(click = {}) {
  return short(clean(click.campaign || click.utmCampaign || click.utm_campaign || click.sourceRef || click.ref || click.utmSource || click.utm_source || click.source || click.buttonText || click.buttonId || "Источник не указан"), 48);
}
function findAttributionClick({ channelId = "", userId = "", at = Date.now() } = {}) {
  const uid = clean(userId);
  if (!uid) return null;
  const from = num(at) - ATTRIBUTION_WINDOW_MS;
  return listGrowthClicks({ channelId, limit: 500 }).filter((click) => clean(click.userId) === uid && num(click.createdAt) >= from && num(click.createdAt) <= num(at) + 5 * 60 * 1000).sort((a, b) => num(b.createdAt) - num(a.createdAt))[0] || null;
}
function buildAttributionForMember({ channelId = "", userId = "", at = Date.now() } = {}) {
  const click = findAttributionClick({ channelId, userId, at });
  if (!click) return { status: "unknown", source: "Источник неизвестен" };
  return {
    status: "confirmed",
    source: sourceLabel(click),
    campaign: clean(click.campaign || click.utmCampaign || click.utm_campaign || ""),
    ad: clean(click.ad || click.utmContent || click.utm_content || ""),
    placement: clean(click.placement || ""),
    clickId: clean(click.id || ""),
    clickedAt: num(click.createdAt)
  };
}
function saveAudienceEvent(channelId = "", input = {}) {
  const id = clean(channelId || input.channelId);
  if (!id) return null;
  const state = channelAudience(id);
  const profile = normalizeMember(input.profile || input.member || input.user || input) || (input.userId ? { userId: clean(input.userId), username: clean(input.username), firstName: clean(input.firstName), lastName: clean(input.lastName), name: clean(input.name) } : null);
  const userId = clean(input.userId || profile?.userId || "");
  const createdAt = num(input.createdAt || Date.now()) || Date.now();
  const type = clean(input.type || "").toLowerCase();
  const attribution = input.attribution || (type === "user_added" ? buildAttributionForMember({ channelId: id, userId, at: createdAt }) : { status: "not_applicable", source: "" });
  const event = {
    id: `${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    channelId: id,
    userId,
    username: clean(profile?.username || input.username || ""),
    firstName: clean(profile?.firstName || input.firstName || ""),
    lastName: clean(profile?.lastName || input.lastName || ""),
    name: clean(profile?.name || input.name || ""),
    displayName: memberName(profile || { userId }),
    source: clean(input.source || "snapshot_diff"),
    attribution,
    createdAt
  };
  event.dedupeKey = [event.type, event.channelId, event.userId, Math.floor(event.createdAt / 60000), event.source].join(":");
  const events = state.events.filter((item) => clean(item.dedupeKey) !== event.dedupeKey);
  events.unshift(event);
  const profiles = { ...state.profiles };
  if (profile && profile.userId) profiles[profile.userId] = { ...(profiles[profile.userId] || {}), ...profile, lastEventType: type, lastEventAt: createdAt };
  saveChannelPatch(id, { audienceEvents: events.slice(0, AUDIENCE_EVENT_LIMIT), audienceProfiles: profiles, audienceUpdatedAt: Date.now() });
  return event;
}
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
  let members = [];
  let memberIds = [];
  let profiles = {};
  if (includeMembers) {
    try {
      members = await getAllChatMembers({ botToken: config.botToken, chatId: normalizedChannelId, pageSize: 100, limit: 20000 });
      members.forEach((member) => {
        const profile = normalizeMember(member);
        if (profile && profile.userId) profiles[profile.userId] = profile;
      });
      memberIds = Object.keys(profiles);
    } catch {}
  }
  const state = channelAudience(normalizedChannelId);
  const previous = state.snapshots[0] || null;
  const previousIds = new Set(arr(previous?.memberIds).map(clean).filter(Boolean));
  const currentIds = new Set(memberIds);
  const joined = [];
  const left = [];
  if (previous && (previousIds.size || currentIds.size)) {
    currentIds.forEach((userId) => { if (!previousIds.has(userId)) joined.push(profiles[userId] || { userId }); });
    previousIds.forEach((userId) => { if (!currentIds.has(userId)) left.push(state.profiles[userId] || { userId }); });
  }
  const capturedAt = Date.now();
  const title = clean(chat?.title || chat?.name || state.channel.title || state.channel.channelTitle || "");
  const snapshot = {
    channelId: normalizedChannelId,
    title,
    capturedAt,
    memberCount: memberCount ?? memberIds.length,
    memberIds,
    memberCountFromMembers: memberIds.length,
    hasProfiles: memberIds.length > 0,
    joinedCount: joined.length,
    leftCount: left.length,
    source: includeMembers ? "api_members" : "api_chat"
  };
  const snapshots = [snapshot, ...state.snapshots].sort((a, b) => num(b.capturedAt) - num(a.capturedAt)).slice(0, AUDIENCE_SNAPSHOT_LIMIT);
  saveChannelPatch(normalizedChannelId, { title: title || state.channel.title, channelTitle: title || state.channel.channelTitle, audienceSnapshots: snapshots, audienceProfiles: { ...state.profiles, ...profiles }, audienceUpdatedAt: capturedAt });
  const legacySnapshot = saveChannelMemberSnapshot(normalizedChannelId, { capturedAt, memberCount: snapshot.memberCount, memberIds, source: snapshot.source });
  joined.forEach((profile) => saveAudienceEvent(normalizedChannelId, { type: "user_added", profile, createdAt: capturedAt, source: "snapshot_diff" }));
  left.forEach((profile) => saveAudienceEvent(normalizedChannelId, { type: "user_removed", profile, createdAt: capturedAt, source: "snapshot_diff" }));
  return { ...legacySnapshot, audienceSnapshot: snapshot, joined, left };
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
function buildTrackedUrl({ appBaseUrl, channelId, buttonId, postId, commentKey, source = "button", campaign = "", ad = "", placement = "" }) {
  const base = String(appBaseUrl || "").trim().replace(/\/$/, "");
  const query = new URLSearchParams();
  if (postId) query.set("postId", String(postId || "").trim());
  if (commentKey) query.set("commentKey", String(commentKey || "").trim());
  if (source) query.set("source", String(source || "").trim());
  if (campaign) query.set("campaign", String(campaign || "").trim());
  if (ad) query.set("ad", String(ad || "").trim());
  if (placement) query.set("placement", String(placement || "").trim());
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
        source: "button",
        campaign: item.campaign || "",
        ad: item.ad || "",
        placement: item.placement || ""
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
          source: "lead",
          campaign: "adminkit_branding",
          placement: "post_keyboard"
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
      trackedUrl: buildTrackedUrl({ appBaseUrl: config.appBaseUrl, channelId, buttonId: item.id, postId, commentKey, source: "button", campaign: item.campaign || "", ad: item.ad || "", placement: item.placement || "" })
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
      options: (poll.options || []).map((option) => ({ id: option.id, text: option.text, votes: counts[option.id] || 0 }))
    };
  }
  const leadMagnetTrackedUrl = branding.leadMagnetUrl
    ? buildTrackedUrl({ appBaseUrl: config.appBaseUrl, channelId, buttonId: "__lead_magnet__", postId, commentKey, source: "lead", campaign: "adminkit_branding", placement: "mini_app" }) + `&target=${encodeURIComponent(branding.leadMagnetUrl)}`
    : "";
  return {
    branding: { showBranding: branding.showBranding, brandName: branding.brandName, brandUrl: branding.brandUrl, agencyMode: branding.agencyMode, planTier: branding.planTier },
    leadMagnet: { enabled: branding.showBranding && branding.leadMagnetEnabled, text: branding.leadMagnetText, targetUrl: branding.leadMagnetUrl, trackedUrl: leadMagnetTrackedUrl },
    trackedButtons: visibleButtons,
    poll: pollData
  };
}
function recordGrowthClick({ channelId = "", buttonId = "", postId = "", commentKey = "", userId = "", config = {}, source = "button", buttonTextOverride = "", targetUrlOverride = "", campaign = "", ad = "", placement = "", ref = "", sourceRef = "", utmSource = "", utmMedium = "", utmCampaign = "", utmContent = "", utmTerm = "" } = {}) {
  const settings = getGrowthSettings(channelId);
  const branding = getBrandingState(channelId, config);
  let button = (settings.trackedButtons || []).find((item) => String(item.id || "") === String(buttonId || ""));
  let targetUrl = "";
  let buttonText = "";
  if (button) {
    targetUrl = String(button.url || "").trim();
    buttonText = String(button.text || "").trim();
    if (!campaign) campaign = String(button.campaign || "").trim();
    if (!ad) ad = String(button.ad || "").trim();
    if (!placement) placement = String(button.placement || "").trim();
  } else if (String(buttonId || "") === "__lead_magnet__") {
    targetUrl = branding.leadMagnetUrl;
    buttonText = branding.leadMagnetText;
    if (!campaign) campaign = "adminkit_branding";
  }
  if (String(buttonTextOverride || "").trim()) buttonText = String(buttonTextOverride || "").trim();
  if (String(targetUrlOverride || "").trim()) targetUrl = String(targetUrlOverride || "").trim();
  const click = addGrowthClick({ channelId, buttonId, buttonText, targetUrl, userId, commentKey, postId, source, campaign, ad, placement, ref, sourceRef, utmSource, utmMedium, utmCampaign, utmContent, utmTerm });
  return { click, targetUrl, buttonText };
}
function voteInPoll({ channelId = "", postId = "", commentKey = "", userId = "", optionId = "" } = {}) {
  const settings = getGrowthSettings(channelId);
  const poll = settings.poll || {};
  if (!poll.enabled) throw new Error("poll_disabled");
  if (poll.postIds?.length && !normalizePostIds(poll.postIds).includes(String(postId || "").trim())) throw new Error("poll_not_available_for_post");
  const option = (poll.options || []).find((item) => String(item.id || "") === String(optionId || ""));
  if (!option) throw new Error("poll_option_not_found");
  const vote = saveGrowthPollVote({ channelId, pollId: poll.id, optionId, userId: String(userId || "guest").trim() || "guest", commentKey, postId, allowRevote: Boolean(poll.allowRevote) });
  return { vote };
}
async function buildAnalyticsSummary(channelId = "", config = {}) {
  const normalizedChannelId = String(channelId || "").trim();
  const posts = getPostsList().filter((post) => !normalizedChannelId || String(post.channelId || "") === normalizedChannelId);
  const commentKeys = posts.map((post) => String(post.commentKey || "").trim()).filter(Boolean);
  const comments = commentKeys.flatMap((commentKey) => getComments(commentKey).map((item) => ({ ...item, commentKey })));
  const commenters = new Set(comments.map((item) => String(item.userId || item.userName || "").trim()).filter(Boolean));
  const reactionTotal = commentKeys.reduce((sum, commentKey) => {
    const reactionMap = store.reactions?.[commentKey] || {};
    let count = 0;
    Object.values(reactionMap).forEach((byEmoji) => Object.values(byEmoji || {}).forEach((byUser) => Object.values(byUser || {}).forEach((isOn) => { if (isOn) count += 1; })));
    return sum + count;
  }, 0);
  const clicks = listGrowthClicks({ channelId: normalizedChannelId, limit: 500 });
  const uniqueClickers = new Set(clicks.map((item) => String(item.userId || "").trim()).filter(Boolean));
  const topButtonsMap = new Map();
  clicks.forEach((click) => { const key = String(click.buttonId || ""); if (!key) return; const item = topButtonsMap.get(key) || { buttonId: key, text: click.buttonText || key, count: 0 }; item.count += 1; topButtonsMap.set(key, item); });
  const pollVotes = listGrowthPollVotes({ channelId: normalizedChannelId });
  const gifts = (store.gifts?.campaigns ? Object.values(store.gifts.campaigns) : []).filter((item) => !normalizedChannelId || String(item.channelId || "") === normalizedChannelId);
  const topPosts = posts.map((post) => {
    const postComments = getComments(post.commentKey);
    const reactionMap = store.reactions?.[post.commentKey] || {};
    let postReactions = 0;
    Object.values(reactionMap).forEach((byEmoji) => Object.values(byEmoji || {}).forEach((byUser) => Object.values(byUser || {}).forEach((isOn) => { if (isOn) postReactions += 1; })));
    const postClicks = listGrowthClicks({ channelId: post.channelId, limit: 5000 }).filter((item) => String(item?.postId || '').trim() === String(post.postId || '').trim() || String(item?.commentKey || '').trim() === String(post.commentKey || '').trim()).length;
    const postPollVotes = listGrowthPollVotes({ channelId: post.channelId }).filter((item) => String(item?.postId || '').trim() === String(post.postId || '').trim() || String(item?.commentKey || '').trim() === String(post.commentKey || '').trim()).length;
    return { commentKey: post.commentKey, postId: post.postId, text: String(post.originalText || '').slice(0, 120), comments: postComments.length, reactions: postReactions, clicks: postClicks, pollVotes: postPollVotes, score: (postComments.length * 5) + (postReactions * 2) + postClicks + postPollVotes };
  }).sort((a, b) => b.score - a.score).slice(0, 10);
  const topCommentersMap = new Map();
  comments.forEach((item) => { const key = String(item.userId || item.userName || "guest").trim(); const current = topCommentersMap.get(key) || { userId: key, userName: item.userName || key, comments: 0 }; current.comments += 1; topCommentersMap.set(key, current); });
  const moderationLogs = (store.moderation?.logs || []).filter((item) => !normalizedChannelId || String(item.channelId || "") === normalizedChannelId);
  const blocked = moderationLogs.filter((item) => item.decision === "blocked").length;
  let channelInfo = { channelId: normalizedChannelId, title: normalizedChannelId || '', memberCount: null, live: false };
  if (normalizedChannelId && config?.botToken) {
    try { const chat = await getChat({ botToken: config.botToken, chatId: normalizedChannelId }); const rawMembers = chat?.members_count ?? chat?.participants_count ?? chat?.membersCount ?? null; channelInfo = { channelId: normalizedChannelId, title: String(chat?.title || chat?.name || normalizedChannelId).trim() || normalizedChannelId, memberCount: rawMembers === null || rawMembers === undefined || Number.isNaN(Number(rawMembers)) ? null : Number(rawMembers), live: true }; } catch {}
  }
  const audience = getAudienceTrendSummary(normalizedChannelId);
  return { channelId: normalizedChannelId, channelInfo, audience, totals: { posts: posts.length, comments: comments.length, commenters: commenters.size, reactions: reactionTotal, clicks: clicks.length, uniqueClickers: uniqueClickers.size, pollVotes: pollVotes.length, moderationBlocked: blocked, gifts: gifts.length }, topPosts, topCommenters: [...topCommentersMap.values()].sort((a, b) => b.comments - a.comments).slice(0, 10), topButtons: [...topButtonsMap.values()].sort((a, b) => b.count - a.count).slice(0, 10), recentClicks: clicks.slice(0, 30) };
}
function buildPostAnalytics(commentKey = "") {
  const normalizedCommentKey = String(commentKey || '').trim();
  const post = getPost(normalizedCommentKey);
  if (!post) return null;
  const comments = getComments(normalizedCommentKey);
  const reactionMap = store.reactions?.[normalizedCommentKey] || {};
  let reactions = 0;
  Object.values(reactionMap).forEach((byEmoji) => Object.values(byEmoji || {}).forEach((byUser) => Object.values(byUser || {}).forEach((isOn) => { if (isOn) reactions += 1; })));
  const clicks = listGrowthClicks({ channelId: post.channelId, limit: 5000 }).filter((item) => String(item?.postId || '').trim() === String(post.postId || '').trim() || String(item?.commentKey || '').trim() === normalizedCommentKey);
  const pollVotes = listGrowthPollVotes({ channelId: post.channelId }).filter((item) => String(item?.postId || '').trim() === String(post.postId || '').trim() || String(item?.commentKey || '').trim() === normalizedCommentKey);
  const uniqueUsers = new Set(comments.map((item) => String(item.userId || item.userName || '').trim()).filter(Boolean));
  const gifts = (store.gifts?.campaigns ? Object.values(store.gifts.campaigns) : []).filter((item) => String(item?.channelId || '').trim() === String(post.channelId || '').trim() && Array.isArray(item?.postIds) && item.postIds.includes(String(post.postId || '').trim()));
  return { commentKey: normalizedCommentKey, postId: post.postId, channelId: post.channelId, title: String(post.originalText || '').slice(0, 160), text: String(post.originalText || '').slice(0, 160), updatedAt: post.updatedAt || 0, gifts: gifts.length, totals: { comments: comments.length, participants: uniqueUsers.size, reactions, clicks: clicks.length, pollVotes: pollVotes.length, replies: comments.filter((item) => String(item.replyToId || '').trim()).length } };
}
function listAudienceEvents({ channelId = "", limit = 100 } = {}) {
  const values = getChannelsList().flatMap((channel) => Array.isArray(channel.audienceEvents) ? channel.audienceEvents : []);
  return values.filter((event) => !channelId || String(event.channelId || "") === String(channelId || "")).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, Math.max(1, Math.min(Number(limit || 100), 500)));
}
module.exports = { getBrandingState, buildGrowthKeyboardRows, getPublicGrowthData, recordGrowthClick, voteInPoll, buildAnalyticsSummary, buildPostAnalytics, captureChannelAudienceSnapshot, getAudienceTrendSummary, listGrowthClicks, listGrowthPollVotes, listAudienceEvents, saveAudienceEvent, buildAttributionForMember, memberName };
