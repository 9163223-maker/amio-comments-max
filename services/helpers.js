function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/$/, "");
}

module.exports = {
  safeJson,
  stripTrailingSlash
};
