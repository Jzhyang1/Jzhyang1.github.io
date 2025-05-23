class PokemonDataManager {
    constructor() {
        this.stats = {
            currency: 0,
            candy: 0,
            totalCaught: 0,
            shinyCaught: 0,
            caughtByRarity: {
                common: 0,
                uncommon: 0,
                rare: 0,
                legendary: 0
            },
            caughtPokemon: []
        };

        this.pokemonValues = {
            common: 10,
            uncommon: 25,
            rare: 50,
            legendary: 100,
            shinyMultiplier: 2
        };

        this.initialized = false;

        // Set up message listener
        window.addEventListener('message', this.handleMessage.bind(this));

        // Handle initialization on bag click
        document.hasStorageAccess().then((hasAccess) => {
            if (hasAccess) {
                window.parent.postMessage({
                    type: 'GAME_INITIALIZE',
                    first: false
                }, '*');
                this.initialized = true;
                this.loadData();
                document.getElementById('initial-bag').classList.add('hidden');
            } else {
                document.getElementById('initial-bag').addEventListener('click', async () => {
                    await document.requestStorageAccess();
                    if (await document.hasStorageAccess()) {
                        window.parent.postMessage({
                            type: 'GAME_INITIALIZE',
                            first: true
                        }, '*');
                        this.initialized = true;
                        this.loadData();
                        document.getElementById('initial-bag').classList.add('hidden');
                        return;
                    } else {
                        console.error('Failed to get storage access');
                    }
                });
            }
        });
    }

    loadData() {
        const savedData = localStorage.getItem('pokemonData');
        if (savedData) {
            const data = JSON.parse(savedData);
            this.stats = data.stats;
            this.pokemonValues = data.pokemonValues;
        }
    }

    saveData() {
        const data = {
            stats: this.stats,
            pokemonValues: this.pokemonValues
        };
        localStorage.setItem('pokemonData', JSON.stringify(data));
    }

    handleMessage(event) {
        const { type, data } = event.data;

        switch (type) {
            case 'GET_DATA':
                this.sendData(event.source, event.origin);
                break;
            case 'CATCH_POKEMON':
                this.catchPokemon(data);
                break;
            case 'EVOLVE_POKEMON':
                this.evolvePokemon(data);
                break;
            case 'SELL_POKEMON':
                this.sellPokemon(data);
                break;
            case 'PURCHASE_CANDY':
                this.purchaseCandy(data);
                break;
            case 'CREATE_POKEMON':
                this.createPokemon();
                break;
        }
    }

    sendData(target, origin) {
        // Use '*' for file:// protocol or when origin is null
        const targetOrigin = origin && origin.startsWith('http') ? origin : '*';
        
        target.postMessage({
            type: 'DATA_UPDATE',
            data: {
                stats: this.stats,
                pokemonValues: this.pokemonValues
            }
        }, targetOrigin);
    }

    catchPokemon(pokemon) {
        this.stats.caughtPokemon.push(pokemon);
        this.stats.totalCaught++;
        if (pokemon.shiny) this.stats.shinyCaught++;
        this.stats.caughtByRarity[pokemon.rarity]++;
        
        // Add currency for catching
        const baseValue = this.pokemonValues[pokemon.rarity];
        const value = pokemon.shiny ? baseValue * this.pokemonValues.shinyMultiplier : baseValue;
        this.stats.currency += Math.floor(value * 0.1); // 10% of value as currency
        
        // Add candy for catching
        const candyReward = Math.floor(value * 0.05); // 5% of value as candy
        this.stats.candy += candyReward;
        
        this.saveData();

        // Send response back to main window
        window.parent.postMessage({
            type: 'CATCH_RESULT',
            success: true,
            candyReward: candyReward
        }, '*');

        // Also send updated data
        this.sendData(window.parent, '*');
    }

    async evolvePokemon(pokemon) {
        const candyCost = this.getEvolutionCost(pokemon.rarity);
        if (this.stats.candy < candyCost) {
            window.parent.postMessage({
                type: 'EVOLUTION_RESULT',
                success: false
            }, '*');
            return false;
        }

        this.stats.candy -= candyCost;
        const evolvedPokemon = await this.getEvolution(pokemon);
        
        // Find the exact Pokemon by matching all relevant properties
        const index = this.stats.caughtPokemon.findIndex(p => 
            p.id === pokemon.id && 
            p.shiny === pokemon.shiny && 
            p.dateCaught === pokemon.dateCaught
        );
        
        this.stats.caughtPokemon[index] = evolvedPokemon;
        this.saveData();

        // Send response back to main window
        window.parent.postMessage({
            type: 'EVOLUTION_RESULT',
            success: true
        }, '*');

        // Also send updated data
        this.sendData(window.parent, '*');
        return true;
    }

    sellPokemon(pokemon) {
        const baseValue = this.pokemonValues[pokemon.rarity];
        const value = pokemon.shiny ? baseValue * this.pokemonValues.shinyMultiplier : baseValue;
        this.stats.currency += Math.floor(value);
        
        // Find the exact Pokemon by matching all relevant properties
        const index = this.stats.caughtPokemon.findIndex(p => 
            p.id === pokemon.id && 
            p.shiny === pokemon.shiny && 
            p.dateCaught === pokemon.dateCaught
        );
        
        if (index !== -1) {
            this.stats.caughtPokemon.splice(index, 1);
            this.stats.caughtByRarity[pokemon.rarity]--;
            this.stats.totalCaught--;
            if (pokemon.shiny) {
                this.stats.shinyCaught--;
            }
        }
        
        this.saveData();

        // Send response back to main window
        window.parent.postMessage({
            type: 'SELL_RESULT',
            success: true
        }, '*');

        // Also send updated data
        this.sendData(window.parent, '*');
    }

    purchaseCandy(amount) {
        const cost = amount * 10; // 10 currency per candy
        if (this.stats.currency < cost) {
            window.parent.postMessage({
                type: 'PURCHASE_RESULT',
                success: false
            }, '*');
            return false;
        }
        
        this.stats.currency -= cost;
        this.stats.candy += amount;
        this.saveData();

        // Send response back to main window
        window.parent.postMessage({
            type: 'PURCHASE_RESULT',
            success: true
        }, '*');

        // Also send updated data
        this.sendData(window.parent, '*');
        return true;
    }

    getEvolutionCost(rarity) {
        const costs = {
            common: 10,
            uncommon: 25,
            rare: 50,
            legendary: 100
        };
        return costs[rarity] || 0;
    }

    async getEvolution(pokemon) {
        // Find the evolution for the given pokemon by name
        const evolution = await getPokemonByName(pokemon.evolution);
        return {
            ...pokemon,
            ...evolution
        };
    }

    async createPokemon() {
        if (!this.initialized) {
            window.parent.postMessage({
                type: 'CREATE_POKEMON',
                success: false,
                message: 'Storage access not initialized',
                pokemon: null
            }, '*');
            return;
        }

        // The pokemon generated is given by the JWT hash of the domain, the user, and the current time
        let user = localStorage.getItem('user');
        if (!user) {
            //generate random user
            user = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('user', user);
        }
        const domain = window.location.hostname;
        const time = new Date().getTime();  // refreshes every millisecond
        const full_string = `${domain}-${user}-${time}`;
        const full_hash = new Uint32Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(full_string)));

        // we use the 2nd 32 bits for shininess
        const shininess_hash = full_hash[1] % 256;
        // we use the next 32 bits for the pokemon index within the rarity
        const pokemon_id_hash = full_hash[2] % 2048;

        // 1% of the time [0-2), we get shiny
        // 99% of the time [2-255), we get non-shiny
        const shiny = shininess_hash < 2;
        
        // within the rarity, we just accept the pokemon_id_hash as the pokemon index
        // but we will return undefined if the pokemon_id_hash is greater than the number of pokemon in the rarity
        let pokemon = await getPokemonById(pokemon_id_hash);

        // rarity filtering rules: legendary pokemon only exist if time ^ id is divisible by 8
        if (pokemon.rarity === 'legendary' && (Date.now() ^ pokemon_id_hash) % 8 !== 0) pokemon = null;
        // same with mythical
        if (pokemon.rarity === 'mythical' && (Date.now() ^ pokemon_id_hash) % 8 !== 0) pokemon = null;
        // rares exist if time ^ id is divisible by 4
        if (pokemon.rarity === 'rare' && (Date.now() ^ pokemon_id_hash) % 4 !== 0) pokemon = null;
        // uncommons exist if time ^ id is divisible by 2
        if (pokemon.rarity === 'uncommon' && (Date.now() ^ pokemon_id_hash) % 2 !== 0) pokemon = null;
        
        window.parent.postMessage({
            type: 'CREATE_POKEMON',
            success: true,
            pokemon: pokemon && {...pokemon, shiny, domainCaught: domain, userCaught: user, dateCaught: time},
        }, '*');
    }
}

// Initialize the data manager
const dataManager = new PokemonDataManager(); 
window.dataManager = dataManager;
