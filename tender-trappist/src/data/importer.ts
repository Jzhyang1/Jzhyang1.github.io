import bio from "./affiliations.json";
import projects from "./projects.json";

export interface Directory {
  [key: string]: Directory | string | Directory[] | string[] | undefined;
}

export default {
  bio,
  projects,
} as Directory;
