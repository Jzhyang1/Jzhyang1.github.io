// cache the pokemon
let PokemonConfig = {
    pokemonPool: new Map(),
    idPool: new Map()
}; 

async function getPokemonByName(name) {
    if (PokemonConfig.pokemonPool.has(name)) {
        return PokemonConfig.pokemonPool.get(name);
    }

    // if the pokemon is not found, check the api
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${name}`);
    if (!response.ok) return null;

    const data = await response.json();

    // get the evolution chain
    const evolutionChain = await fetch(data.evolution_chain.url);
    const evolutionChainData = await evolutionChain.json();
    const next_evolutions = (function getCurrentEvolutions(current_evolution) {
        if (current_evolution.species.name == data.name) {
            return current_evolution.evolves_to.length > 0 ? current_evolution.evolves_to.map(e => e.species.name) : null;
        } else if (current_evolution.evolves_to.length > 0) {
            return current_evolution.evolves_to.reduce((acc, e) => {
                return acc || getCurrentEvolutions(e);
            }, null);
        } else {
            return null;
        }
    })(evolutionChainData.chain);

    const description = data.flavor_text_entries.find(entry => entry.language.name === 'en')?.flavor_text.replace(/\n/g, ' ');

    const encounter_rate = data.pal_park_encounters.reduce((acc, e) => acc < e.rate ? e.rate : acc, 1);
    const pokemon = {
        name: data.name,
        id: data.id,
        rarity: data.is_legendary ? 'legendary' : data.is_mythical ? 'mythical' : encounter_rate <= 10 ? 'rare' : encounter_rate <= 20 ? 'uncommon' : 'common',
        evolution: next_evolutions,
        description: description
    };

    PokemonConfig.pokemonPool.set(name, pokemon);
    PokemonConfig.idPool.set(data.id, pokemon);
    return pokemon;
}

function getPokemonById(id) {
    if (PokemonConfig.idPool.has(id)) {
        return PokemonConfig.idPool.get(id);
    }

    // there are presently only 649 pokemon in version 5, so if the id is greater than that, return null
    if (id > 649) {
        return null;
    }

    // since the pokemon API supports id and name queries, we can reuse the above function
    return getPokemonByName(id);
}
