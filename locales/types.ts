
/**
 * 【架构背景】
 * 在大型国际化项目中，硬编码字符串是维护的噩梦。本文件定义了全局唯一的“语言契约”。
 * 
 * 【设计目标】
 * 1. 强类型约束：利用 TypeScript 的接口继承，强制所有语言包（EN/ZH）必须实现 100% 的键值对对齐。
 * 2. 模块化命名空间：按功能域（common, wallet, tx, safe）划分，防止词条冲突，提升可读性。
 * 
 * 【解决问题】
 * 解决了“漏译”、“词条路径错误”以及“IDE 无法自动补全翻译键”的痛点。
 */
export interface I18nSchema {
  common: {
    confirm: string; cancel: string; save: string; delete: string;
    loading: string; error: string; back: string; max: string;
    update: string; propose: string; execute: string; sign: string;
    booting: string; available: string; unknown: string; native: string;
    native_label: string;
  };
  // ... 其他模块保持结构对齐
  intro: { secure_context: string; headline_date: string; headline_text: string; awaiting: string; };
  wallet: { 
    title: string; intro: string; connect_title: string; connect_desc: string;
    disclaimer: string; beta: string; kill_sig: string; master_key: string;
    node_master: string; local_eoa: string; verified_safes: string; empty_vault: string;
    deplo_new: string; import: string; active_key: string; total_net_worth: string;
    operational_logs: string; no_logs: string; asset_inventory: string;
    import_token: string; import_token_btn: string; custom: string; tron_node: string;
  };
  tx: {
    send: string; send_btn: string; recipient: string; amount: string;
    insufficient: string; status_confirmed: string; status_failed: string;
    error_tron_prefix: string; error_tron_length: string; error_evm_prefix: string;
    error_evm_length: string; error_invalid_format: string; warning_liquidity: string;
    warning_desc: string; proceed_anyway: string; return_to_base: string;
    inspect_tx: string; view_explorer: string; broadcast: string;
    propose_tx: string; broadcasting: string; syncing_payload: string;
    transmission_confirmed: string; validated_ledger: string; pending_validation: string;
    broadcast_success: string; background_run: string; protocol_fault: string;
    reboot_form: string;
  };
  safe: {
    queue_title: string; current_nonce: string; all_clear: string; signatures: string;
    settings_title: string; ownership_matrix: string; consensus: string; append_member: string;
    propose_action: string; adjust_consensus: string; threshold_desc: string;
    deploy_title: string; initial_registry: string; no_owners: string; add_first_owner: string;
    governance_threshold: string; execute_deployment: string; sync_existing: string;
    track_title: string; initiate_sync: string; error_empty: string; error_prefix: string;
    error_length: string; error_format: string; sig_required: string; sigs_required: string;
    mod_btn: string;
  };
  settings: {
    title: string; subtitle: string; current_network: string; rpc_connection: string;
    select_node: string; custom_rpc: string; node_hint: string; block_explorer: string;
    pref_explorer: string; open_website: string; tech_details: string; chain_id: string;
    currency: string; contribute: string; add_custom_token: string; local_storage_hint: string;
    contract_address: string; import_token_btn: string; github_add: string; edit_token: string;
    symbol: string; decimals: string;
  };
}
