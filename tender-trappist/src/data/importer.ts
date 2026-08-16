import bio from "./affiliations.json";
import projects from "./projects.json";

export interface Directory {
  [key: string]: Directory | string | Directory[] | string[] | undefined;
}

export default {
  home: { href: "/" },
  bio,
  experience: { href: "/exp" },
  gallery: { href: "/gallery" },
  projects,
  resume: { href: "/Resume.pdf" },
  github: { href: "https://github.com/Jzhyang1" },
  linkedin: { href: "https://www.linkedin.com/in/jzhyang" },
  discord: { href: "https://discord.com/" },
  instagram: { href: "https://www.instagram.com/jzhyang1" },
} as Directory;
