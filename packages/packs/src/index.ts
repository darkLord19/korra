import "server-only";
import type { ReadyPack } from "@korra/core";
import type { RenderedPack } from "./rendered";
import { renderGuide } from "./guide";
import { getLayout } from "./layouts";
import { renderPdf } from "./pdf";
import { bankSlug } from "./util";
import { renderXlsx } from "./xlsx";
import { renderZip } from "./zip";

export { listLayouts, LayoutNotFoundError } from "./layouts";
export { renderDeclaration } from "./declaration";

export const PACKAGE = "@korra/packs";

export type { RenderedPack };

const enc = new TextEncoder();

export async function renderPack(
  pack: ReadyPack,
  layoutId: string,
  supportingDocs: { name: string; bytes: Uint8Array }[],
): Promise<RenderedPack> {
  const layout = getLayout(layoutId);
  const slug = bankSlug(pack.adBank.name);
  const [pdf, xlsx, zip] = await Promise.all([
    renderPdf(pack, layout),
    renderXlsx(layout, pack.rows),
    renderZip(supportingDocs),
  ]);
  return {
    files: [
      { name: `EDF-${slug}-${pack.month}.pdf`, mimeType: "application/pdf", bytes: pdf },
      {
        name: `EDF-${slug}-${pack.month}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes: xlsx,
      },
      { name: `supporting-${pack.month}.zip`, mimeType: "application/zip", bytes: zip },
      {
        name: `HOW-TO-SUBMIT-${slug}.md`,
        mimeType: "text/markdown",
        bytes: enc.encode(renderGuide(layout, pack.adBank.name, pack.month)),
      },
    ],
  };
}
