import AllInMagazinSale from "./AllInMagazinSale";

type Props = {
  apiBase?: string;
  actor?: string;
  role?: "admin" | "shop";
  shopId?: "csikszereda" | "kezdivasarhely";
  onLogout?: () => void | Promise<void>;
};

export default function AllInMagazinCiucSale(props: Props) {
  return (
    <AllInMagazinSale
      {...props}
      locationCode="main_warehouse"
      locationName="Magazin - Miercurea Ciuc"
      cityName="Csíkszereda"
      homeHash="magazinciuc"
    />
  );
}
