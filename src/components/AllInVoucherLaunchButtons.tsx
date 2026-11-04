import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const VOUCHER_ICON_URL = "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/voucher.svg";

type Props = { visible: boolean; mode: "admin-home" | "shop-sale"; onOpen: () => void };

/**
 * Az admin fomenu az AllInHome.tsx-ben rajzolja a sajat gombjat.
 * Itt kizarolag a ket bolti ELADASI fejlecbe illesztjuk az utalvany-gombot,
 * amig a sale-wrapper teljes kodja nincs nalunk.
 */
export default function AllInVoucherLaunchButtons({ visible, mode, onOpen }: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!visible || mode !== "shop-sale" || typeof document === "undefined") {
      setHost(null);
      return;
    }
    let placeholder: HTMLDivElement | null = null;

    const findSaleAnchor = (): HTMLElement | null => {
      for (const header of document.querySelectorAll("header")) {
        if (header.querySelector("h1")?.textContent?.trim() !== "Új eladás") continue;
        const buttons = Array.from(header.querySelectorAll<HTMLButtonElement>("button"));
        return buttons.find(b => (b.textContent || "").includes("Adminisztráció")) ||
          buttons.find(b => (b.textContent || "").includes("Kilépés")) || null;
      }
      return null;
    };

    const attach = () => {
      if (placeholder?.isConnected) return;
      const anchor = findSaleAnchor();
      if (!anchor?.parentElement) return;
      if (document.getElementById("aif-voucher-shop-sale-portal")) return;
      placeholder = document.createElement("div");
      placeholder.id = "aif-voucher-shop-sale-portal";
      placeholder.className = "inline-flex shrink-0";
      anchor.insertAdjacentElement("beforebegin", placeholder);
      setHost(placeholder);
    };

    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    attach();
    return () => { observer.disconnect(); placeholder?.remove(); setHost(null); };
  }, [visible, mode]);

  if (!visible || mode !== "shop-sale" || !host) return null;
  return createPortal(
    <button
      type="button"
      onClick={onOpen}
      title="Ajándékutalványok"
      aria-label="Ajándékutalványok"
      className="inline-flex h-12 max-w-[260px] shrink-0 items-center justify-start overflow-hidden rounded-xl border border-white/18 bg-black p-0 transition hover:brightness-110 active:scale-[0.98]"
    >
      <img
        src={VOUCHER_ICON_URL}
        alt=""
        draggable={false}
        className="block h-full w-auto max-w-[258px] object-contain object-left"
      />
    </button>,
    host,
  );
}
