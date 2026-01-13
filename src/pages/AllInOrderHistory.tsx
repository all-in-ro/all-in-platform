import { Button } from "@/components/ui/button";
import { Clock, ArrowLeft } from "lucide-react";

export default function AllInOrderHistory() {
  return (
    <div className="min-h-screen w-screen" style={{ backgroundColor: "#474c59" }}>
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <Button
            className="h-10 rounded-xl px-4 text-white bg-[#354153] hover:bg-[#3c5069] border border-white/40"
            onClick={() => (window.location.hash = "#allin")}
            type="button"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Vissza
          </Button>

          <div className="text-white/90 text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>RENDELÉS – HISTORY</span>
          </div>

          <div className="w-[96px]" />
        </div>

        <div className="rounded-lg border border-white/20 bg-white/5 shadow-sm px-6 py-8">
          <h1 className="text-center text-2xl text-white mb-2">Rendelési előzmények</h1>
          <p className="text-center text-white/70 text-sm">
            Itt fogja a kliens visszanézni, mikor melyik beszállítótól milyen ruhát rendelt,
            milyen mennyiségben és méretben. Most még csak a váz van kész.
          </p>

          <div className="mt-6 rounded-lg border border-white/15 bg-black/10 p-4">
            <div className="text-white/80 text-sm">
              <div className="font-medium text-white mb-2">Tervezett tartalom (menet közben rakjuk össze):</div>
              <ul className="list-disc pl-5 space-y-1">
                <li>Dátum (év/hónap szűrő, pl. „tavaly”)</li>
                <li>Beszállító</li>
                <li>Termék (modell / szín)</li>
                <li>Méret</li>
                <li>Mennyiség</li>
                <li>Megjegyzés / rendelési azonosító</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              className="h-10 rounded-xl px-4 border border-white/40 text-white bg-transparent hover:bg-white/10"
              onClick={() => (window.location.hash = "#allin")}
              type="button"
            >
              Vissza a kezdőlapra
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
