// Strip ANSI escape codes from terminal output
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

export interface BuddyDetection {
  buddyName: string
  message: string
}

// Known companion patterns. Each has a name and a regex that matches their speech.
// The regex should capture the speech text in group 1.
const COMPANION_PATTERNS: { name: string; pattern: RegExp }[] = [
  // Jostle (Claude Code turtle) — speech appears near the companion name
  // Match lines that look like speech bubble content near "Jostle" or similar names
  { name: 'Jostle', pattern: /(?:Jostle|jostle)[\s\S]{0,20}?["""](.+?)["""]/i },
  // Generic companion speech bubble — captures text after common companion indicators
  { name: 'Companion', pattern: /[🐢🐱🐶🦊🐻]\s*[:\-–—]\s*(.+)/i },
]

// Buffer recent lines to detect multi-line companion speech
const BUDDY_SCAN_WINDOW = 5

export class BuddyDetector {
  private recentLines: string[] = []
  private lastDetectionTime = 0
  private cooldownMs = 3000 // Avoid duplicate detections

  /**
   * Feed a complete line of terminal output. Returns a detection if companion speech is found.
   */
  detectLine(rawLine: string): BuddyDetection | null {
    const stripped = stripAnsi(rawLine).trim()
    if (!stripped) return null

    this.recentLines.push(stripped)
    if (this.recentLines.length > BUDDY_SCAN_WINDOW) {
      this.recentLines.shift()
    }

    // Check each line in the window against known patterns
    const window = this.recentLines.join(' ')

    for (const { name, pattern } of COMPANION_PATTERNS) {
      const match = window.match(pattern)
      if (match && match[1]) {
        const now = Date.now()
        if (now - this.lastDetectionTime < this.cooldownMs) return null
        this.lastDetectionTime = now
        this.recentLines = [] // Reset window after detection
        return { buddyName: name, message: match[1].trim() }
      }
    }

    // Fallback: check if any line contains a known companion name followed by speech-like text
    // This catches informal patterns like "Jostle: hey there"
    const nameMatch = stripped.match(/^(Jostle|Turtle|Buddy|Companion)\s*[:]\s*(.+)/i)
    if (nameMatch) {
      const now = Date.now()
      if (now - this.lastDetectionTime < this.cooldownMs) return null
      this.lastDetectionTime = now
      this.recentLines = []
      return { buddyName: nameMatch[1], message: nameMatch[2].trim() }
    }

    return null
  }
}
