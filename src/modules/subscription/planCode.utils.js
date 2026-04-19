const Plan = require('./plan.model')

function normalizePlanCode (code) {
  return String(code || '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]/g, '')
}

function levenshtein (a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return dp[m][n]
}

/**
 * @param {string} codeUpper trimmed uppercase code from request
 * @param {import('mongoose').Types.ObjectId|string|null} excludePlanId current plan when updating
 * @throws {Error} statusCode 409 with message
 */
async function assertNoPlanCodeConflict (codeUpper, excludePlanId) {
  const incoming = String(codeUpper || '').trim().toUpperCase()
  const incomingNorm = normalizePlanCode(incoming)
  if (!incomingNorm.length) {
    const err = new Error('Plan code is required')
    err.statusCode = 400
    throw err
  }

  const query = excludePlanId ? { _id: { $ne: excludePlanId } } : {}
  const others = await Plan.find(query).select('code').lean()

  for (const row of others) {
    const other = String(row.code || '').toUpperCase()
    const otherNorm = normalizePlanCode(other)
    if (otherNorm === incomingNorm) {
      const err = new Error(
        `Plan code '${incoming}' conflicts with existing code '${other}' (same normalized form).`
      )
      err.statusCode = 409
      throw err
    }
  }

  for (const row of others) {
    const otherNorm = normalizePlanCode(row.code)
    if (otherNorm === incomingNorm) continue
    const minLen = Math.min(incomingNorm.length, otherNorm.length)
    if (minLen < 4) continue
    if (levenshtein(incomingNorm, otherNorm) <= 1) {
      const err = new Error(
        `Plan code '${incoming}' is too similar to existing code '${row.code}'.`
      )
      err.statusCode = 409
      throw err
    }
  }
}

module.exports = {
  normalizePlanCode,
  levenshtein,
  assertNoPlanCodeConflict
}
