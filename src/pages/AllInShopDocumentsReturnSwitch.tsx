import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SHOPIFY_ICON_URL = "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/spfyicon.png";

type Props = {
  open: boolean;
  count: number;
  pending: number;
  onOpenShopify: () => void;
};

/**
 * A két régi üzlet saját bizonylatablakának fejlécébe illeszti a visszaváltó gombot.
 * A meglévő AllInShopDocuments modult változatlanul hagyja, a dolgozó régi
 * bizonylatait és a már jól működő nyomtatást nem írja át.
 */
export default function AllInShopDocumentsReturnSwitch({ open, count, pending, onOpenShopify }: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      setHost(null);
      return;
    }

    const findHeaderButtons = (): HTMLElement | null => {
      // A "Saját nyilvántartás és bizonyítékok" ablakot azonosítjuk,
      // nem egy másik, esetleg ugyanabban a pillanatban megnyitott modalt.
      for (const node of document.querySelectorAll<HTMLDivElement>("div.fixed.inset-0")) {
        const header = node.querySelector("header");
        const heading = header?.querySelector("h2");
        if (heading?.textContent?.trim() !== "Bizonylatok") continue;
        if (!header?.textContent?.includes("Saját nyilvántartás")) continue;
        const buttons = Array.from(header.querySelectorAll<HTMLButtonElement>("button"));
        const refresh = buttons.find(button => button.textContent?.includes("Frissítés"));
        if (refresh?.parentElement) return refresh.parentElement;
      }
      return null;
    };

    const update = () => {
      const found = findHeaderButtons();
      setHost(current => current === found ? current : found);
    };

    // A saját bizonylatok ablaka portálként kerül a body-ba, ezért
    // a célhely a következő React commit után jelenhet meg.
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => { observer.disconnect(); setHost(null); };
  }, [open]);

  if (!open || !host) return null;

  return createPortal(
    <button
      type="button"
      onClick={onOpenShopify}
      title="Vissza a Shopify kimenő Avizokhoz és előzményekhez"
      className="order-first inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-[#96BF48]/65 bg-[#96BF48]/22 px-3 text-[11px] text-white transition hover:bg-[#96BF48]/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#96BF48]"
    >
      <img src={SHOPIFY_ICON_URL} alt="" className="h-5 w-5 object-contain" />
      <span className="hidden sm:inline">Shopify bizonylatok</span>
      <span className="sm:hidden">Shopify</span>
      <span className="rounded-full border border-[#96BF48]/35 bg-black/15 px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span>
      {pending > 0 ? <span className="hidden rounded-md bg-[#96BF48]/25 px-1.5 py-0.5 text-[9px] text-[#eaffd5] lg:inline">{pending} vár</span> : null}
    </button>,
    host,
  );
}
