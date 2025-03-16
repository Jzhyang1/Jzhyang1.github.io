import bio from "./affiliations.json"
import projects from "./projects.json"

export interface Directory {
    [key: string]: Directory | string | Directory[] | string[];
}
//Hello Jonathan, love you cutie mwahhhhh <3<3<3 hehehe Carlos bananas heheheoogabooganuggetraaawrrr
export default {
    bio,
    projects
} as Directory;