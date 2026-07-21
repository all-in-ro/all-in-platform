import AllInMagazinSale from "./AllInMagazinSale";

type Props = {
  apiBase?: string;
  actor?: string;
  role?: "admin" | "shop";
  shopId?: "csikszereda" | "kezdivasarhely";
  onLogout?: () => void | Promise<void>;
};

export default function AllInMagazinTarguSale(props: Props) {
  return (
    <AllInMagazinSale
      {...props}
      locationCode="magazin_targu_secuiesc"
      locationName="Magazin - Târgu Secuiesc"
      cityName="Kézdivásárhely"
      homeHash="magazintargu"
    />
  );
}
