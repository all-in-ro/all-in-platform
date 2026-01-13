import { Button } from "@/components/ui/button";

export default function AllInReserved() {
  return (
    <div className="min-h-screen w-screen grid place-items-center" style={{ backgroundColor: "#474c59" }}>
      <div className="w-full max-w-3xl px-4">
        <div className="rounded-lg border border-white/20 bg-white/5 shadow-sm px-6 py-8">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-white text-xl font-semibold">LEFOGLALT TERMÉKEK</h1>
            <Button
              className="h-10 px-4 rounded-xl text-white bg-[#354153] hover:bg-[#3c5069] border border-white/40"
              onClick={() => (window.location.hash = "#allin")}
            >
              Vissza
            </Button>
          </div>
          <div className="mt-6 text-white/80 text-sm">
            Ide jön a lefoglalt termékek listája és kezelése (logolással).
          </div>
        </div>
      </div>
    </div>
  );
}
