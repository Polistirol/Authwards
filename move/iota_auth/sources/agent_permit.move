// IOTA Auth Layer — AgentPermit Smart Contract
// Contratto Move per gestire i permessi degli agenti on-chain.
// 
// Questo contratto è il cuore della delega verificabile:
// definisce cosa un agente può fare, con quali limiti, e per quanto tempo.
// Chiunque può verificare i permessi on-chain senza fidarsi del backend.
//
// DEPLOY: compilare e deployare su IOTA mainnet.
// Il package address dopo il deploy va salvato nel .env come PERMIT_PACKAGE_ID.

module iota_auth::agent_permit {
    
    use iota::object;
    use iota::transfer;
    //use iota::tx_context;
    use iota::clock::{Self, Clock};
    use iota::event;

    // ============================================================
    // STRUCTS
    // ============================================================

    /// L'oggetto AgentPermit: rappresenta i permessi di un agente.
    /// Viene creato dall'owner (utente umano) e trasferito all'agente
    /// durante l'onboarding.
    public struct AgentPermit has key, store {
        id: UID,
        // DID dell'agente (stringa, es. "did:iota:0x789...")
        agent_did: vector<u8>,
        // DID dell'owner che ha creato la delega
        owner_did: vector<u8>,
        // Indirizzo wallet dell'owner (per verifiche on-chain)
        owner_address: address,
        // Limiti di spesa
        max_per_tx: u64,        // max IOTA per singola transazione (in nanos)
        max_per_day: u64,       // max IOTA al giorno (in nanos)
        // Tracking spesa giornaliera
        spent_today: u64,       // quanto ha speso oggi (in nanos)
        last_reset_day: u64,    // timestamp dell'ultimo reset (inizio giornata)
        // Scadenza della delega
        expires_at: u64,        // timestamp di scadenza (0 = no scadenza)
        // Stato
        is_active: bool,        // l'owner può disattivare la delega
        // Metadata
        created_at: u64,        // timestamp di creazione
    }

    // ============================================================
    // EVENTS
    // ============================================================

    /// Evento emesso quando un AgentPermit viene creato
    public struct PermitCreated has copy, drop {
        permit_id: address,
        agent_did: vector<u8>,
        owner_did: vector<u8>,
        max_per_tx: u64,
        max_per_day: u64,
        expires_at: u64,
    }

    /// Evento emesso quando un agente esegue una transazione autorizzata
    public struct AgentAction has copy, drop {
        permit_id: address,
        agent_did: vector<u8>,
        amount: u64,
        remaining_daily: u64,
    }

    /// Evento emesso quando un permit viene revocato
    public struct PermitRevoked has copy, drop {
        permit_id: address,
        agent_did: vector<u8>,
        owner_did: vector<u8>,
    }

    // ============================================================
    // ERRORI
    // ============================================================

    /// L'agente non è il proprietario del permit
    const E_NOT_AUTHORIZED: u64 = 0;
    /// Il permit è scaduto
    const E_PERMIT_EXPIRED: u64 = 1;
    /// Il permit è disattivato
    const E_PERMIT_INACTIVE: u64 = 2;
    /// Importo supera il limite per transazione
    const E_EXCEEDS_TX_LIMIT: u64 = 3;
    /// Importo supera il limite giornaliero
    const E_EXCEEDS_DAILY_LIMIT: u64 = 4;
    /// Solo l'owner può fare questa operazione
    const E_NOT_OWNER: u64 = 5;

    // ============================================================
    // FUNZIONI PUBBLICHE
    // ============================================================

    /// Crea un nuovo AgentPermit.
    /// Chiamata dall'owner (utente umano) dalla piattaforma.
    /// Il permit viene creato come oggetto shared, accessibile
    /// sia dall'owner che dall'agente (tramite la piattaforma).
    public entry fun create_permit(
        agent_did: vector<u8>,
        owner_did: vector<u8>,
        max_per_tx: u64,
        max_per_day: u64,
        expires_at: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let permit = AgentPermit {
            id: object::new(ctx),
            agent_did,
            owner_did,
            owner_address: tx_context::sender(ctx),
            max_per_tx,
            max_per_day,
            spent_today: 0,
            last_reset_day: now,
            expires_at,
            is_active: true,
            created_at: now,
        };

        let permit_id = object::uid_to_address(&permit.id);

        event::emit(PermitCreated {
            permit_id,
            agent_did: permit.agent_did,
            owner_did: permit.owner_did,
            max_per_tx,
            max_per_day,
            expires_at,
        });

        // Rendi l'oggetto shared così sia owner che piattaforma
        // possono interagire con esso
        transfer::public_share_object(permit);
    }

    /// Verifica e registra una spesa dell'agente.
    /// Chiamata dalla piattaforma (signing proxy) prima di firmare
    /// una transazione per conto dell'agente.
    /// Se la verifica passa, aggiorna spent_today.
    /// Se non passa, abortisce con errore.
    public entry fun authorize_spend(
        permit: &mut AgentPermit,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);

        // Verifica che il permit sia attivo
        assert!(permit.is_active, E_PERMIT_INACTIVE);

        // Verifica scadenza (0 = no scadenza)
        if (permit.expires_at > 0) {
            assert!(now < permit.expires_at, E_PERMIT_EXPIRED);
        };

        // Verifica limite per transazione
        assert!(amount <= permit.max_per_tx, E_EXCEEDS_TX_LIMIT);

        // Reset giornaliero se è passato un giorno (86400000 ms)
        let day_ms: u64 = 86400000;
        if (now - permit.last_reset_day >= day_ms) {
            permit.spent_today = 0;
            permit.last_reset_day = now;
        };

        // Verifica limite giornaliero
        assert!(
            permit.spent_today + amount <= permit.max_per_day,
            E_EXCEEDS_DAILY_LIMIT
        );

        // Registra la spesa
        permit.spent_today = permit.spent_today + amount;

        let remaining = permit.max_per_day - permit.spent_today;

        event::emit(AgentAction {
            permit_id: object::uid_to_address(&permit.id),
            agent_did: permit.agent_did,
            amount,
            remaining_daily: remaining,
        });
    }

    /// Disattiva un permit. Solo l'owner originale può farlo.
    public entry fun revoke_permit(
        permit: &mut AgentPermit,
        ctx: &mut TxContext,
    ) {
        // Solo l'owner può revocare
        assert!(
            tx_context::sender(ctx) == permit.owner_address,
            E_NOT_OWNER
        );

        permit.is_active = false;

        event::emit(PermitRevoked {
            permit_id: object::uid_to_address(&permit.id),
            agent_did: permit.agent_did,
            owner_did: permit.owner_did,
        });
    }

    /// Riattiva un permit precedentemente revocato. Solo l'owner.
    public entry fun reactivate_permit(
        permit: &mut AgentPermit,
        ctx: &mut TxContext,
    ) {
        assert!(
            tx_context::sender(ctx) == permit.owner_address,
            E_NOT_OWNER
        );
        permit.is_active = true;
    }

    /// Aggiorna i limiti di un permit. Solo l'owner.
    public entry fun update_limits(
        permit: &mut AgentPermit,
        new_max_per_tx: u64,
        new_max_per_day: u64,
        new_expires_at: u64,
        ctx: &mut TxContext,
    ) {
        assert!(
            tx_context::sender(ctx) == permit.owner_address,
            E_NOT_OWNER
        );
        permit.max_per_tx = new_max_per_tx;
        permit.max_per_day = new_max_per_day;
        permit.expires_at = new_expires_at;
    }

    // ============================================================
    // VIEW FUNCTIONS (lettura)
    // ============================================================

    /// Ritorna le info del permit (per la dashboard)
    public fun get_permit_info(permit: &AgentPermit): (
        vector<u8>,  // agent_did
        vector<u8>,  // owner_did
        u64,         // max_per_tx
        u64,         // max_per_day
        u64,         // spent_today
        u64,         // expires_at
        bool,        // is_active
    ) {
        (
            permit.agent_did,
            permit.owner_did,
            permit.max_per_tx,
            permit.max_per_day,
            permit.spent_today,
            permit.expires_at,
            permit.is_active,
        )
    }

    /// Controlla se un permit è valido per una certa spesa
    /// (senza modificare lo stato — solo lettura)
    public fun can_spend(
        permit: &AgentPermit,
        amount: u64,
        current_time_ms: u64,
    ): bool {
        if (!permit.is_active) return false;
        if (permit.expires_at > 0 && current_time_ms >= permit.expires_at) return false;
        if (amount > permit.max_per_tx) return false;
        
        // Calcola spent_today considerando eventuale reset
        let day_ms: u64 = 86400000;
        let effective_spent = if (current_time_ms - permit.last_reset_day >= day_ms) {
            0
        } else {
            permit.spent_today
        };
        
        if (effective_spent + amount > permit.max_per_day) return false;
        
        true
    }
}
