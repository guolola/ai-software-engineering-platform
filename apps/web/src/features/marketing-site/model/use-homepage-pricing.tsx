// Fits the current billing catalog into Flow's three existing pricing slots.
import { useEffect, useState } from 'react';
import { Flower2Icon, FlowerIcon, SproutIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BillingSkuDto } from '@uml-platform/contracts';
import { billingApi } from '../../user-platform/services/billing-api';
import type { Plans } from '../template/components/blocks/pricing/pricing';

export function useHomepagePricing(): Plans {
  const { t, i18n } = useTranslation();
  const en = i18n.resolvedLanguage === 'en';
  const [skus, setSkus] = useState<BillingSkuDto[]>([]);
  useEffect(() => {
    let active = true;
    billingApi.listSkus().then(result => { if (active) setSkus(result.skus.filter(sku => sku.active).sort((a,b) => a.sortOrder - b.sortOrder)); }).catch(() => { if (active) setSkus([]); });
    return () => { active = false; };
  }, []);
  return [<SproutIcon />, <FlowerIcon />, <Flower2Icon />].map((icon, index) => {
    const sku = skus[index];
    return {
      icon,
      title: sku ? t(`billing.sku.catalog.${sku.code}.name`, { defaultValue: sku.name }) : en ? 'Current packages' : '当前套餐',
      description: sku ? t(`billing.sku.catalog.${sku.code}.description`, { defaultValue: sku.description }) : en ? 'Check account billing for availability.' : '可用权益请查看账户计费页面。',
      price: { monthly: sku ? sku.amountCents / 100 : null, yearly: sku?.creditAmount ?? null },
      period: en ? ' / purchase' : ' / 次购买',
      buttonText: en ? 'View account billing' : '查看账户权益',
      features: [en ? 'Requirements and UML modeling' : '需求分析与 UML 建模', en ? 'Design and code prototypes' : '设计与代码原型', en ? 'Specification generation' : '工程说明书生成', en ? 'Tasks and artifact history' : '任务与产物历史', en ? 'See billing for full package details' : '完整套餐信息以计费页面为准'],
      isPopular: index === 1,
    };
  });
}
