/* What the instrument picker says while the fund catalogue is not there yet.

   Nobody presses anything for the catalogue any more: every page load asks
   the backend, which downloads it in the background when it is missing or a
   week old. So an empty list has one sentence for each place that download can
   be, in the reader's words, and never a button. Once the catalogue has funds
   in it nothing is said at all: an old list still works, so a refresh that is
   running, or that failed, is not something the reader has to know.

   No runtime imports, so `npm test` reaches it. */

/** What `/api/instruments/catalogue` and every search report. */
export interface CatalogueState {
  rows: number;
  state: "ready" | "downloading" | "failed" | "not_started";
  /** When a failed download is tried again, at a page load, at the earliest. */
  retry_after: string | null;
}

const MEANWHILE = "在此期间，你输入的内容可以照常使用。";

/** The sentence for an empty catalogue, or null when there is nothing to say.
    `clockTime` turns the retry moment into the reader's own clock time. */
export function catalogueNotice(
  status: CatalogueState | null,
  clockTime: (iso: string) => string,
): string | null {
  if (status === null || status.rows > 0) return null;
  switch (status.state) {
    case "downloading":
      return (
        "基金目录正在自动下载。" +
        `下载完成后基金会出现在这里。${MEANWHILE}`
      );
    case "failed":
      return (
        "基金目录无法从 justETF 下载。应用会在下次打开或刷新页面时自动重试" +
        (status.retry_after ? `（最早 ${clockTime(status.retry_after)} 起）` : "") +
        `。${MEANWHILE}`
      );
    default:
      // Empty, and nothing has asked since the server started: a page left
      // open while the backend was restarted.
      return `基金目录会在应用打开时自动下载。刷新页面即可开始。${MEANWHILE}`;
  }
}
