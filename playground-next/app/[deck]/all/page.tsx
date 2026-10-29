import { decks } from "../../../lib/decks";

export const generateStaticParams = decks.deckParams;
export const generateMetadata = decks.printMetadata;
export default decks.PrintPage;
