import { Button } from "@/components/ui/button";
import { Package, Truck, History, Bookmark, Repeat, ClipboardList, Settings, LogOut } from "lucide-react";

type Props = {
  onLogout?: () => void;
};

const LOGO_URL =
  "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/allin-logo-w.png";

export default function AllInHome(props: Props) {
  const mainBtn =
    "w-full h-12 rounded-xl px-4 bg-[#354153] text-white hover:bg-[#3c5069] flex items-center justify-between border border-white/40";

  const logout = async () => {
    try {
      await props.onLogout?.();
    } finally {
      window.location.hash = "";
    }
  };

  return (
    <div className="min-h-screen w-screen grid place-items-center" style={{ backgroundColor: "#474c59" }}>
      <div className="w-full max-w-lg px-4">
        <div className="rounded-lg border border-white/20 bg-white/5 shadow-sm px-6 py-8">
          
          {/* logo */}
          <div className="grid place-items-center mb-5">
            <img
              src={LOGO_URL}
              alt="ALL IN"
              className="h-10 sm:h-12 w-auto object-contain"
              loading="eager"
            />
          </div>

          <div className="space-y-3">
            <Button className={mainBtn} onClick={() => (window.location.hash = "#allinwarehouse")}>
              <span>RAKTÁR</span>
              <Package className="h-4 w-4" />
            </Button>

            <Button className={mainBtn} onClick={() => (window.location.hash = "#allinincoming")}>
              <span>ÁRU BEVÉTELEZÉS</span>
              <Truck className="h-4 w-4" />
            </Button>

            <div className="pt-4 mt-2 border-t border-white/15 space-y-3">
              <Button className={mainBtn} onClick={() => (window.location.hash = "#allinorderhistory")}>
                <span>RENDELÉS – HISTORY</span>
                <History className="h-4 w-4" />
              </Button>

              <Button className={mainBtn} onClick={() => (window.location.hash = "#allinreserved")}>
                <span>LEFOGLALT TERMÉKEK</span>
                <Bookmark className="h-4 w-4" />
              </Button>

              <Button className={mainBtn} onClick={() => (window.location.hash = "#allinstockmoves")}>
                <span>RAKTÁRMOZGÁS</span>
                <Repeat className="h-4 w-4" />
              </Button>

              <Button className={mainBtn} onClick={() => (window.location.hash = "#allininventory")}>
                <span>LELTÁR</span>
                <ClipboardList className="h-4 w-4" />
              </Button>

              <Button className={mainBtn} onClick={() => (window.location.hash = "#allinadmin")}>
                <span>ADMINISZTRÁCIÓ</span>
                <Settings className="h-4 w-4" />
              </Button>
            </div>

            {/* logout */}
            <div className="pt-6 mt-4 border-t border-white/10 flex justify-center">
              <button
                onClick={logout}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition"
                type="button"
              >
                <LogOut className="h-4 w-4" />
                Kilépés
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
