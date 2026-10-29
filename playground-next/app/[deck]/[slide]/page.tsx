import { decks } from "../../../lib/decks";

export const generateStaticParams = decks.slideParams;
export const generateMetadata = decks.slideMetadata;
export default decks.SlidePage;
