import { Button } from "@/components/ui/button";
import { ArrowLeft, Repeat, Calendar, Users, Car } from "lucide-react";

export default function AllInAdmin() {
  const mainBtn =
    "w-full h-12 rounded-xl px-4 bg-[#354153] text-white hover:bg-[#3c5069] flex items-center justify-between border border-white/40";

  return (
    <div className="min-h-screen w-screen grid place-items-center" style={{ backgroundColor: "#474c59" }}>
      <div className="w-full max-w-lg px-4">
        <div className="rounded-lg border border-white/20 bg-white/5 shadow-sm px-6 py-8">
          <div className="flex items-center justify-between">
            <h1 className="text-white text-xl font-semibold">ADMINISZTRÁCIÓ</h1>
            <Button
              className="h-10 px-4 rounded-xl text-white bg-[#354153] hover:bg-[#3c5069] border border-white/40"
              onClick={() => (window.location.hash = "#allin")}
              type="button"
            >
              <span className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Vissza
              </span>
            </Button>
          </div>

          <div className="mt-6 space-y-3">
            <Button className={mainBtn} onClick={() => (window.location.hash = "#allinproductmoves")}>
              <span>TERMÉKMOZGÁS</span>
              <Repeat className="h-4 w-4" />
            </Button>

            <Button className={mainBtn} onClick={() => (window.location.hash = "#allinvacations")}>
              <span>SZABADSÁGOK</span>
              <Calendar className="h-4 w-4" />
            </Button>

            <Button className={mainBtn} onClick={() => (window.location.hash = "#allinusers")}>
              <span>FELHASZNÁLÓK</span>
              <Users className="h-4 w-4" />
            </Button>

            <div className="pt-4 mt-2 border-t border-white/15">
              <Button className={mainBtn} onClick={() => (window.location.hash = "#allincars")}>
                <span>AUTÓK</span>
                <Car className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
