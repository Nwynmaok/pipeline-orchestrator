/**
 * Telegram Bot API integration.
 * Sends sync messages directly via POST https://api.telegram.org/bot{TOKEN}/sendMessage
 */
export class TelegramClient {
  private baseUrl: string;
  private chatId: string;

  constructor(botToken: string, chatId: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
    this.chatId = chatId;
  }

  /**
   * Send a message to the configured chat.
   * Uses Markdown parse mode to match the existing sync message format.
   */
  async sendMessage(text: string): Promise<void> {
    const url = `${this.baseUrl}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API error ${response.status}: ${body}`);
    }

    const result = await response.json() as { ok: boolean; description?: string };
    if (!result.ok) {
      throw new Error(`Telegram API returned ok=false: ${result.description}`);
    }
  }

  /**
   * Send a long message, splitting into chunks if it exceeds Telegram's 4096 char limit.
   */
  async sendLongMessage(text: string): Promise<void> {
    const MAX_LENGTH = 4096;

    if (text.length <= MAX_LENGTH) {
      await this.sendMessage(text);
      return;
    }

    // Split on double newlines to avoid breaking mid-project-block
    const chunks: string[] = [];
    let current = '';

    for (const line of text.split('\n')) {
      if (current.length + line.length + 1 > MAX_LENGTH) {
        chunks.push(current);
        current = line;
      } else {
        current += (current ? '\n' : '') + line;
      }
    }
    if (current) chunks.push(current);

    for (const chunk of chunks) {
      await this.sendMessage(chunk);
    }
  }

  /**
   * Verify the bot token is valid by calling getMe.
   */
  async verify(): Promise<{ username: string }> {
    const url = `${this.baseUrl}/getMe`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Telegram API error ${response.status}: bot token may be invalid`);
    }

    const result = await response.json() as { ok: boolean; result?: { username: string } };
    if (!result.ok || !result.result) {
      throw new Error('Telegram API: getMe failed');
    }

    return { username: result.result.username };
  }
}
