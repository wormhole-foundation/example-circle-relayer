import { DataSource } from "typeorm";
import { Relay } from "./relay.model";
import * as mongodb from "mongodb";

export async function setupDb({
  uri = "mongodb://localhost:27017",
  database = "relays",
}: any): Promise<DataSource> {
  const RelaysDS = new DataSource({
    type: "mongodb",
    url: uri,
    database,
    entities: [Relay],
    synchronize: true,
  });

  return RelaysDS.initialize();
}
