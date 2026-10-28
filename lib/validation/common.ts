import { z } from "zod";
import { msg } from "@/lib/i18n/translate";

/** Ids sent from the client. Format check only; ownership is checked in the data layer. */
export const idSchema = z.uuid(msg("Invalid id"));
