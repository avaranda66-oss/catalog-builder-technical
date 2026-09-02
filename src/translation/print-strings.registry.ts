export interface PrintStringDefinition {
  key: string;
  defaultText: string;
  description: string;
  translations?: Record<string, string>; // BCP-47 -> localized string
}

export const SYSTEM_PRINT_STRINGS: Record<string, PrintStringDefinition> = {
  page_label: {
    key: 'page_label',
    defaultText: 'Página',
    description: 'Rótulo de página nos rodapés e cabeçalhos',
    translations: {
      'en-US': 'Page',
      'es-ES': 'Página',
      'fr-FR': 'Page',
      'de-DE': 'Seite',
      'th-TH': 'หน้า',
      'ru-RU': 'Страница',
      'zh-CN': '页',
      'ar-SA': 'صفحة'
    }
  },
  of_label: {
    key: 'of_label',
    defaultText: 'de',
    description: 'Preposição entre página atual e total (Página X de Y)',
    translations: {
      'en-US': 'of',
      'es-ES': 'de',
      'fr-FR': 'sur',
      'de-DE': 'von',
      'th-TH': 'จาก',
      'ru-RU': 'из',
      'zh-CN': '共',
      'ar-SA': 'من'
    }
  },
  model_label: {
    key: 'model_label',
    defaultText: 'Modelo',
    description: 'Cabeçalho de coluna de modelo de instrumento',
    translations: {
      'en-US': 'Model',
      'es-ES': 'Modelo',
      'fr-FR': 'Modèle',
      'de-DE': 'Modell',
      'th-TH': 'รุ่น',
      'ru-RU': 'Модель',
      'zh-CN': '型号',
      'ar-SA': 'النموذج'
    }
  },
  description_label: {
    key: 'description_label',
    defaultText: 'Descrição',
    description: 'Cabeçalho de coluna de descrição comercial/técnica',
    translations: {
      'en-US': 'Description',
      'es-ES': 'Descripción',
      'fr-FR': 'Description',
      'de-DE': 'Beschreibung',
      'th-TH': 'คำอธิบาย',
      'ru-RU': 'Описание',
      'zh-CN': '描述',
      'ar-SA': 'الوصف'
    }
  },
  technical_specifications: {
    key: 'technical_specifications',
    defaultText: 'Especificações Técnicas',
    description: 'Título padrão de seções e tabelas de especificações',
    translations: {
      'en-US': 'Technical Specifications',
      'es-ES': 'Especificaciones Técnicas',
      'fr-FR': 'Spécifications Techniques',
      'de-DE': 'Technische Daten',
      'th-TH': 'ข้อมูลจำเพาะทางเทคนิค',
      'ru-RU': 'Технические характеристики',
      'zh-CN': '技术规格',
      'ar-SA': 'المواصفات الفنية'
    }
  },
  subject_to_change_notice: {
    key: 'subject_to_change_notice',
    defaultText: 'Especificações técnicas sujeitas a alterações sem aviso prévio.',
    description: 'Aviso legal metrológico impresso nos rodapés dos catálogos',
    translations: {
      'en-US': 'Technical specifications are subject to change without prior notice.',
      'es-ES': 'Especificaciones técnicas sujetas a cambios sin previo aviso.',
      'fr-FR': 'Spécifications techniques sujettes à modification sans préavis.',
      'de-DE': 'Technische Änderungen ohne Vorankündigung vorbehalten.',
      'th-TH': 'ข้อมูลจำเพาะอาจเปลี่ยนแปลงได้โดยไม่ต้องแจ้งให้ทราบล่วงหน้า',
      'ru-RU': 'Технические характеристики могут быть изменены без предварительного уведомления.',
      'zh-CN': '技术规格如有变更，恕不另行通知。',
      'ar-SA': 'المواصفات الفنية عرضة للتغيير دون إشعار مسبق.'
    }
  },
  ordering_code_label: {
    key: 'ordering_code_label',
    defaultText: 'Código para Pedido',
    description: 'Cabeçalho de bloco de codificação de encomenda',
    translations: {
      'en-US': 'Ordering Code',
      'es-ES': 'Código de Pedido',
      'fr-FR': 'Code de Commande',
      'de-DE': 'Bestellcode',
      'th-TH': 'รหัสสำหรับการสั่งซื้อ',
      'ru-RU': 'Код для заказа',
      'zh-CN': '订货代码',
      'ar-SA': 'رمز الطلب'
    }
  },
  standard_accessories: {
    key: 'standard_accessories',
    defaultText: 'Acessórios Inclusos',
    description: 'Título de tabela de acessórios fornecidos com o instrumento',
    translations: {
      'en-US': 'Included Accessories',
      'es-ES': 'Accesorios Incluidos',
      'fr-FR': 'Accessoires Inclus',
      'de-DE': 'Lieferumfang / Zubehör',
      'th-TH': 'อุปกรณ์เสริมที่ให้มาพร้อมเครื่อง',
      'ru-RU': 'Комплект поставки',
      'zh-CN': '标配附件',
      'ar-SA': 'الملحقات المضمنة'
    }
  },
  optional_accessories: {
    key: 'optional_accessories',
    defaultText: 'Acessórios Opcionais',
    description: 'Título de tabela de acessórios opcionais e sobressalentes',
    translations: {
      'en-US': 'Optional Accessories',
      'es-ES': 'Accesorios Opcionales',
      'fr-FR': 'Accessoires Optionnels',
      'de-DE': 'Optionales Zubehör',
      'th-TH': 'อุปกรณ์เสริมทางเลือก',
      'ru-RU': 'Опциональные принадлежности',
      'zh-CN': '可选附件',
      'ar-SA': 'الملحقات الاختيارية'
    }
  },
  features_overview: {
    key: 'features_overview',
    defaultText: 'Principais Recursos & Vantagens',
    description: 'Título de destaque para listas de diferenciais e recursos',
    translations: {
      'en-US': 'Key Features & Benefits',
      'es-ES': 'Características y Beneficios Principales',
      'fr-FR': 'Caractéristiques et Avantages Principaux',
      'de-DE': 'Hauptmerkmale und Vorteile',
      'th-TH': 'คุณสมบัติหลักและประโยชน์',
      'ru-RU': 'Ключевые особенности и преимущества',
      'zh-CN': '主要特性与优势',
      'ar-SA': 'الميزات والفوائد الرئيسية'
    }
  },
  contact_information: {
    key: 'contact_information',
    defaultText: 'Informações de Contato e Suporte',
    description: 'Título de rodapé para dados de atendimento corporativo',
    translations: {
      'en-US': 'Contact & Support Information',
      'es-ES': 'Información de Contacto y Soporte',
      'fr-FR': 'Contact et Support Technique',
      'de-DE': 'Kontakt- und Supportinformationen',
      'th-TH': 'ข้อมูลการติดต่อและบริการสนับสนุน',
      'ru-RU': 'Контактная информация и поддержка',
      'zh-CN': '联系与支持信息',
      'ar-SA': 'معلومات الاتصال والدعم'
    }
  },
  company_brand_header: {
    key: 'company_brand_header',
    defaultText: 'PRESYS INSTRUMENTS & SYSTEMS — CATALOG STUDIO',
    description: 'Marca institucional padrão no cabeçalho editorial',
    translations: {
      'en-US': 'PRESYS INSTRUMENTS & SYSTEMS — CATALOG STUDIO'
    }
  },
  company_brand_footer: {
    key: 'company_brand_footer',
    defaultText: 'PRESYS Instruments & Systems — Specifications subject to change without notice',
    description: 'Marca institucional com disclaimer no rodapé editorial',
    translations: {
      'en-US': 'PRESYS Instruments & Systems — Specifications subject to change without notice'
    }
  },
  legend_title: {
    key: 'legend_title',
    defaultText: 'LEGENDA METROLÓGICA:',
    description: 'Título da legenda da tabela de especificações',
    translations: {
      'en-US': 'LEGEND:'
    }
  },
  legend_filled_square: {
    key: 'legend_filled_square',
    defaultText: 'Item de série incluído na configuração padrão',
    description: 'Item de legenda para quadrado preenchido',
    translations: {
      'en-US': 'Included in standard configuration'
    }
  },
  legend_empty_square: {
    key: 'legend_empty_square',
    defaultText: 'Item opcional disponível sob encomenda',
    description: 'Item de legenda para quadrado vazio',
    translations: {
      'en-US': 'Optional / available upon request'
    }
  },
  legend_asterisk: {
    key: 'legend_asterisk',
    defaultText: 'Consultar nota técnica de rodapé (*)',
    description: 'Item de legenda para asterisco',
    translations: {
      'en-US': 'Refer to technical footnote (*)'
    }
  },
  legend_dash: {
    key: 'legend_dash',
    defaultText: 'Não aplicável para este modelo',
    description: 'Item de legenda para traço',
    translations: {
      'en-US': 'Not applicable for this model'
    }
  }
};

export class PrintStringRegistry {
  private static overrides = new Map<string, Map<string, string>>();

  /**
   * Verifica se uma chave existe no catálogo de strings de sistema registradas.
   */
  static has(key: string): boolean {
    return Boolean(key && SYSTEM_PRINT_STRINGS[key]);
  }

  /**
   * Obtém a string de sistema formatada para o idioma solicitado com fallback inteligente.
   */
  static get(key: string, targetLocale = 'pt-BR'): string {
    // 1. Verifica override dinâmico
    const localeOverrides = this.overrides.get(targetLocale);
    if (localeOverrides && localeOverrides.has(key)) {
      return localeOverrides.get(key)!;
    }

    const def = SYSTEM_PRINT_STRINGS[key];
    if (!def) return key;

    // 2. Se o idioma for o padrão português
    if (targetLocale.startsWith('pt')) {
      return def.defaultText;
    }

    // 3. Tradução aprovada no dicionário estático
    if (def.translations && def.translations[targetLocale]) {
      return def.translations[targetLocale];
    }

    // 4. Fallback para idioma base (ex: 'en' para 'en-GB')
    const baseLanguage = targetLocale.split('-')[0];
    if (def.translations) {
      for (const [loc, text] of Object.entries(def.translations)) {
        if (loc.startsWith(baseLanguage)) {
          return text;
        }
      }
      if (def.translations['en-US']) {
        return def.translations['en-US'];
      }
    }

    return def.defaultText;
  }

  /**
   * Registra ou sobrescreve uma string de sistema para um idioma específico em runtime.
   */
  static setOverride(locale: string, key: string, translatedText: string): void {
    if (!this.overrides.has(locale)) {
      this.overrides.set(locale, new Map());
    }
    this.overrides.get(locale)!.set(key, translatedText);
  }

  /**
   * Lista todas as chaves de sistema imprimíveis cadastradas.
   */
  static getAllKeys(): string[] {
    return Object.keys(SYSTEM_PRINT_STRINGS);
  }
}
