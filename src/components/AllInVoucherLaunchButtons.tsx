import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const ICON = "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/voucher.svg";

type Props = { visible: boolean; mode: "admin-home" | "shop-sale"; onOpen: () => void };

// Ideiglenes, biztonsagosan elszigetelt fejlec/fomenu gomb. A jelenlegi
// AllInHome + ket sale-wrapper teljes forrasanak beerkezese utan kozvetlenul
// ott lehet elhelyezni a gombot; ez a komponens a kasszat nem modositja.
export default function AllInVoucherLaunchButtons({ visible, mode, onOpen }: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!visible || typeof document === "undefined") { setHost(null); return; }
    let placeholder: HTMLDivElement | null = null;
    const findHomeAnchor = (): HTMLElement | null => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"));
      return nodes.find(node => (node.textContent || "").includes("ÁRU BEVÉTELEZÉS") && (node.textContent || "").length < 130) || null;
    };
    const findSaleAnchor = (): HTMLElement | null => {
      for (const header of document.querySelectorAll("header")) {
        const title = header.querySelector("h1")?.textContent?.trim();
        if (title !== "Új eladás") continue;
        const buttons = Array.from(header.querySelectorAll<HTMLButtonElement>("button"));
        return buttons.find(b => (b.textContent || "").includes("Adminisztráció")) ||
          buttons.find(b => (b.textContent || "").includes("Kilépés")) || null;
      }
      return null;
    };
    const attach = () => {
      if (placeholder?.isConnected) return;
      const anchor = mode === "admin-home" ? findHomeAnchor() : findSaleAnchor();
      if (!anchor?.parentElement) return;
      if (document.getElementById(`aif-voucher-${mode}-portal`)) return;
      placeholder = document.createElement("div");
      placeholder.id = `aif-voucher-${mode}-portal`;
      placeholder.className = mode === "admin-home" ? "w-full" : "inline-flex";
      anchor.insertAdjacentElement(mode === "admin-home" ? "afterend" : "beforebegin", placeholder);
      setHost(placeholder);
    };
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList:true, subtree:true });
    attach();
    return () => { observer.disconnect(); placeholder?.remove(); setHost(null); };
  }, [visible, mode]);
  if (!visible || !host) return null;
  return createPortal(
    mode === "admin-home" ? (
      <button type="button" onClick={onOpen} className="flex min-h-[42px] w-full items-center gap-3 rounded-xl border border-white/18 bg-[#343e4d] px-3 text-left text-[13px] font-normal text-white transition hover:border-[#80d9d3]/45 hover:bg-[#3c4b5e]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/18 bg-white/[0.05]"><img src={ICON} alt="" className="h-5 w-5 object-contain"/></span>
        <span className="min-w-0 flex-1">AJÁNDÉKUTALVÁNYOK</span>
        <span className="text-white/40">›</span>
      </button>
    ) : (
      <button type="button" onClick={onOpen} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/22 bg-[#354153] px-4 text-sm text-white transition hover:border-[#9be9e5]/42 hover:bg-[#435267] active:scale-[.98]">
        <img src={ICON} alt="" className="h-6 w-6 object-contain"/> Ajándékutalvány
      </button>
    ), host
  );
}
