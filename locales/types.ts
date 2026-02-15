
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
	    import_placeholder: string;
	    address_qr_title: string;
	    address_qr_subtitle: string;
	    badge_rpc_only: string;
	    badge_zero_telemetry: string;
    network_node_updated: string;
    invalid_token_address: string;
    token_already_exists: string;
    token_imported: string;
    token_import_failed: string;
    token_updated: string;
    token_removed: string;
    data_sync_fault: string;
    import_invalid: string;
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
    err_wallet_provider_not_ready: string;
    err_safe_manager_not_ready: string;
    err_tron_private_key_missing: string;
    err_tron_broadcast_failed: string;
    err_confirmation_timeout: string;
    err_unknown_failure: string;
    summary_send: string;

    err_insufficient_funds: string;
    err_numeric_fault: string;
    err_nonce_expired: string;
    err_replacement_underpriced: string;
    err_action_rejected: string;
    err_call_exception: string;
    err_unpredictable_gas: string;
    err_insufficient_funds_short: string;
    err_gas_limit_low: string;
    err_nonce_too_low: string;
    err_already_known: string;
    err_execution_reverted: string;
    err_reason: string;
    err_safe_gs013: string;
    err_safe_gs026: string;
    err_transaction_failed: string;

    err_network_error: string;
    err_timeout: string;
    err_rpc_http_status: string;
    err_rpc_rate_limited: string;
    err_rpc_unauthorized: string;
    err_rpc_forbidden: string;
    err_rpc_not_found: string;
    err_rpc_bad_gateway: string;
    err_rpc_service_unavailable: string;
    err_rpc_gateway_timeout: string;
    err_rpc_cors: string;
    err_rpc_connection_refused: string;
    err_rpc_dns: string;
    err_rpc_method_not_found: string;
    err_rpc_invalid_params: string;
    err_rpc_internal_error: string;
    err_rpc_parse_error: string;
    err_rpc_invalid_request: string;
    err_tx_underpriced: string;
    err_fee_cap_too_low: string;
    err_priority_fee_too_low: string;
    err_intrinsic_gas_too_low: string;
    err_already_replaced: string;
  };
  safe: {
    settings_title: string; ownership_matrix: string; consensus: string; append_member: string;
    propose_action: string; adjust_consensus: string; threshold_desc: string;
    deploy_title: string; initial_registry: string; no_owners: string; add_first_owner: string;
    governance_threshold: string; execute_deployment: string; sync_existing: string;
    track_title: string; initiate_sync: string; error_empty: string; error_prefix: string;
    error_length: string; error_format: string; sig_required: string; sigs_required: string;
    mod_btn: string;
    op_constructing: string;
    op_broadcasting: string;
    op_queued: string;
    op_scanning: string;
    op_timeout: string;
    op_verified: string;
    op_proposed: string;
    op_fault: string;
    op_access_denied: string;
    op_proposal_failed: string;
    err_busy: string;
    err_not_owner: string;
    err_proposal_failed: string;
    err_multisig_queue_unavailable: string;
    err_signing_failed: string;
    err_execution_failed: string;
    err_current_wallet_not_owner: string;
    err_not_enough_signatures: string;
    notice_safe_deploy_submitted: string;
    notice_safe_deployed_success: string;
    notice_signature_added: string;
    notice_execution_broadcasted: string;
    err_safe_deploy_failed_after_submit: string;
    err_deployment_failed: string;
    err_owner_not_found: string;
    summary_safe_exec: string;
    summary_proposal: string;
    summary_deploy_safe: string;
    summary_add_owner: string;
    summary_remove_owner: string;
    summary_change_threshold: string;
    sig_short: string;
  };
  settings: {
    title: string; subtitle: string; current_network: string; rpc_connection: string;
    select_node: string; custom_rpc: string; node_hint: string; block_explorer: string;
    pref_explorer: string; open_website: string; tech_details: string; chain_id: string;
    currency: string; contribute: string; add_custom_token: string; local_storage_hint: string;
    contract_address: string; import_token_btn: string; github_add: string; edit_token: string;
    symbol: string; decimals: string;
    rpc_required: string;
    rpc_must_http: string;
    tron_rpc_validation_failed: string;
    save_failed: string;
    no_explorers: string;
    public_node: string;
    rpc_url_invalid_scheme: string;
    rpc_chainid_mismatch: string;
    rpc_validation_failed: string;
    console: string;
    console_desc: string;
    open_console: string;
  };
  console: {
    title: string;
    subtitle: string;
    dock_title: string;
    dock_empty: string;
    dock_hint: string;
    expand: string;
    minimize: string;
    batch: string;
    intent_get_balance: string;
    intent_get_nonce: string;
    intent_broadcast_tx: string;
    intent_get_receipt: string;
    intent_get_code: string;
    intent_get_block: string;
    intent_call_contract: string;
    intent_estimate_gas: string;
    intent_token_balance: string;
    intent_safe_owners: string;
    intent_safe_threshold: string;
    intent_safe_nonce: string;
    hosts: string;
    events: string;
    empty: string;
    clear: string;
    close: string;
    method: string;
    url: string;
    status: string;
    duration: string;
    action: string;
    action_unknown: string;
    search_placeholder: string;
    only_rpc: string;
    category_rpc: string;
    category_http: string;
    details: string;
    request: string;
    response: string;
    rpc_method: string;
    rpc_batch: string;
    redacted: string;
    rpc: {
      eth_getBalance: string;
      eth_getTransactionCount: string;
      eth_getTransactionReceipt: string;
      eth_sendRawTransaction: string;
      eth_getCode: string;
      eth_call: string;
      eth_estimateGas: string;
      eth_feeHistory: string;
      eth_gasPrice: string;
      eth_maxPriorityFeePerGas: string;
      eth_getBlockByNumber: string;
      net_version: string;
      web3_clientVersion: string;
    };
    tron: {
      getaccount: string;
      triggerconstantcontract: string;
      triggersmartcontract: string;
      createtransaction: string;
      broadcasttransaction: string;
      gettransactioninfobyid: string;
      probe: string;
    };
  };
}
