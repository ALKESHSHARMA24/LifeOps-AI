import { Metadata } from "next";
import SearchClient from "./search-client";

export const metadata: Metadata = {
  title: "Search — LifeOps",
};

export default function SearchPage() {
  return <SearchClient />;
}
