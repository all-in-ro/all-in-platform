import { Button } from "@/components/ui/button";
import { Package, Truck, History, Bookmark, Repeat, ClipboardList, Settings, LogOut } from "lucide-react";

type Props = {
  onLogout?: () => void;
};

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
          <h1 className="text-center text-2xl text-white mb-6">ALL IN</h1>

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

            <div className="pt-4 mt-2 border-t border-white/15">
              <Button className={mainBtn} onClick={logout}>
                <span>KILÉPÉS</span>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
